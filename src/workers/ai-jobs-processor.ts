/**
 * AI Jobs Queue Processor
 *
 * Core logic for processing pending AI vision jobs.
 * Called by Vercel Cron worker or manual trigger.
 *
 * Flow:
 * 1. Fetch pending jobs (oldest first)
 * 2. Mark as 'processing'
 * 3. Call GLM Vision API
 * 4. Parse and validate results
 * 5. Create food log entries
 * 6. Mark job as 'completed' or 'failed'
 */

import { db } from '@/lib/db';
import { aiJobs, foodLogs, logItems } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';
import {
  analyzeFoodImage,
  calculateAverageConfidence,
  convertToLogItems,
  createImageHash,
  getCachedImageAnalysis,
  saveAnalysisToCache,
} from '@/lib/glm-vision';

/**
 * Configuration
 */
const MAX_JOBS_PER_RUN = 10; // Process max 10 jobs per cron invocation
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes before marking stuck jobs as failed
const MAX_RETRIES = 3; // Maximum retry attempts for failed jobs
const BASE_RETRY_DELAY_MS = 1000; // Base delay for exponential backoff (1s)

/**
 * Fetch pending AI jobs from the queue
 * @param limit - Maximum number of jobs to fetch
 * @returns Array of pending jobs
 */
export async function fetchPendingJobs(limit: number = MAX_JOBS_PER_RUN) {
  const cutoffTime = new Date(Date.now() - JOB_TIMEOUT_MS);

  // First, mark any stuck 'processing' jobs as failed
  await db
    .update(aiJobs)
    .set({
      status: 'failed',
      completedAt: new Date(),
    })
    .where(
      and(
        eq(aiJobs.status, 'processing'),
        lte(aiJobs.createdAt, cutoffTime)
      )
    );

  // Fetch pending jobs (oldest first)
  const jobs = await db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.status, 'pending'))
    .orderBy(aiJobs.createdAt)
    .limit(limit);

  return jobs;
}

/**
 * Mark a job as processing
 * @param jobId - Job ID to update
 */
export async function markJobProcessing(jobId: string) {
  await db
    .update(aiJobs)
    .set({
      status: 'processing',
    })
    .where(eq(aiJobs.id, jobId));
}

/**
 * Mark a job as completed
 * @param jobId - Job ID to update
 */
export async function markJobCompleted(jobId: string) {
  await db
    .update(aiJobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
    })
    .where(eq(aiJobs.id, jobId));
}

/**
 * Mark a job as failed
 * @param jobId - Job ID to update
 * @param error - Optional error message
 * @param retryCount - Current retry count
 * @returns True if job should be retried
 */
export async function markJobFailed(
  jobId: string,
  error?: string,
  retryCount: number = 0
): Promise<boolean> {
  console.error(`Job ${jobId} failed:`, error);

  const shouldRetry = retryCount < MAX_RETRIES;

  await db
    .update(aiJobs)
    .set({
      status: shouldRetry ? 'pending' : 'failed',
      retryCount: shouldRetry ? retryCount + 1 : retryCount,
      errorMessage: error,
      completedAt: shouldRetry ? null : new Date(),
    })
    .where(eq(aiJobs.id, jobId));

  return shouldRetry;
}

/**
 * Process a single AI job
 *
 * @param job - The AI job to process
 * @returns True if successful, false otherwise
 */
export async function processAiJob(job: typeof aiJobs.$inferSelect): Promise<boolean> {
  const jobId = job.id;
  const userId = job.userId;
  const imageUrl = job.imageUrl;
  const currentRetryCount = job.retryCount ?? 0;

  if (!imageUrl) {
    await markJobFailed(jobId, 'No image URL', currentRetryCount);
    return false;
  }

  if (!userId) {
    await markJobFailed(jobId, 'No user ID', currentRetryCount);
    return false;
  }

  try {
    // Mark as processing
    await markJobProcessing(jobId);

    // Create image hash for cache lookup
    const imageHash = await createImageHash(imageUrl);

    // Check cache FIRST before calling GLM API
    let analysisResult = await getCachedImageAnalysis(imageHash);
    let cacheHit = false;

    if (analysisResult) {
      console.log(`Job ${jobId}: Cache hit for image hash ${imageHash.substring(0, 8)}...`);
      cacheHit = true;
    } else {
      // Cache miss - call GLM Vision API
      console.log(`Job ${jobId}: Cache miss, calling GLM API...`);
      analysisResult = await analyzeFoodImage(imageUrl);

      if (!analysisResult || analysisResult.items.length === 0) {
        const shouldRetry = await markJobFailed(jobId, 'AI analysis returned no results', currentRetryCount);
        if (shouldRetry) {
          console.log(`Job ${jobId} will be retried (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`);
        }
        return false;
      }

      // Save to cache for future use
      await saveAnalysisToCache(imageHash, analysisResult);
      console.log(`Job ${jobId}: Analysis saved to cache`);
    }

    // Calculate confidence score
    const avgConfidence = calculateAverageConfidence(analysisResult.items);

    // Create food log entry
    const totalCalories = analysisResult.items.reduce(
      (sum, item) => sum + item.calories,
      0
    );

    const [foodLog] = await db
      .insert(foodLogs)
      .values({
        userId,
        jobId,
        mealType: 'unclassified', // Can be updated by user later
        totalCalories,
        aiConfidenceScore: avgConfidence,
        isVerified: false,
      })
      .returning();

    if (!foodLog) {
      const shouldRetry = await markJobFailed(jobId, 'Failed to create food log', currentRetryCount);
      if (shouldRetry) {
        console.log(`Job ${jobId} will be retried (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`);
      }
      return false;
    }

    // Convert and insert log items
    const logItemsData = convertToLogItems(analysisResult.items);

    // Insert all items
    const insertedItems = await Promise.all(
      logItemsData.map((item) =>
        db
          .insert(logItems)
          .values({
            logId: foodLog.id,
            ...item,
          })
          .returning()
      )
    );

    if (insertedItems.length === 0) {
      const shouldRetry = await markJobFailed(jobId, 'Failed to insert log items', currentRetryCount);
      if (shouldRetry) {
        console.log(`Job ${jobId} will be retried (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`);
      }
      return false;
    }

    // Mark job as completed
    await markJobCompleted(jobId);

    console.log(
      `Job ${jobId} ${cacheHit ? '(cache hit)' : ''} completed: ${insertedItems.length} items, ${totalCalories} calories`
    );

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const shouldRetry = await markJobFailed(jobId, errorMessage, currentRetryCount);
    
    if (shouldRetry) {
      // Calculate exponential backoff delay
      const backoffDelay = BASE_RETRY_DELAY_MS * Math.pow(2, currentRetryCount);
      console.log(
        `Job ${jobId} failed with "${errorMessage}". Retrying after ${backoffDelay}ms (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`
      );
      
      // Add delay before retry (pending status will be picked up in next cron run)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    } else {
      console.error(
        `Job ${jobId} failed permanently after ${MAX_RETRIES} retries: ${errorMessage}`
      );
    }
    
    return false;
  }
}

/**
 * Main queue processor - called by cron or immediate trigger
 * @param specificJobId - Optional specific job ID to process immediately
 * @returns Summary of processed jobs
 */
export async function processAiJobsQueue(specificJobId?: string) {
  console.log(
    specificJobId
      ? `Starting AI jobs processor for specific job ${specificJobId}...`
      : 'Starting AI jobs queue processor...'
  );

  let jobsToProcess: typeof aiJobs.$inferSelect[];

  if (specificJobId) {
    // Process a specific job immediately
    const job = await db
      .select()
      .from(aiJobs)
      .where(eq(aiJobs.id, specificJobId))
      .limit(1);

    if (job.length === 0) {
      console.log(`Job ${specificJobId} not found`);
      return { processed: 0, success: 0, failed: 0 };
    }

    // Only process if still pending or processing
    if (job[0].status !== 'pending' && job[0].status !== 'processing') {
      console.log(
        `Job ${specificJobId} already ${job[0].status}, skipping`
      );
      return { processed: 0, success: 0, failed: 0 };
    }

    jobsToProcess = job;
    console.log(`Processing specific job ${specificJobId}`);
  } else {
    // Process queue normally
    jobsToProcess = await fetchPendingJobs();

    if (jobsToProcess.length === 0) {
      console.log('No pending jobs');
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`Found ${jobsToProcess.length} pending jobs`);
  }

  let successCount = 0;
  let failedCount = 0;

  // Process jobs sequentially to avoid rate limits
  for (const job of jobsToProcess) {
    const success = await processAiJob(job);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }

    // Add small delay between jobs to avoid API rate limits
    if (jobsToProcess.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `Queue processing complete: ${successCount} successful, ${failedCount} failed`
  );

  return {
    processed: jobsToProcess.length,
    success: successCount,
    failed: failedCount,
  };
}
