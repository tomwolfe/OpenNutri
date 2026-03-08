/**
 * Image Upload API Route
 *
 * Handles food image uploads for AI vision processing.
 * Creates an AI job in 'pending' status and returns job ID.
 * Client will poll for status while Vercel Cron processes the job.
 *
 * Immediate Trigger: After creating the job, we fire a background request
 * to the cron endpoint to start processing immediately (instead of waiting
 * for the next cron run). The cron serves as a safety net.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadFoodImage } from '@/lib/blob';
import { db } from '@/lib/db';
import { aiJobs } from '@/db/schema';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { createImageHash } from '@/lib/glm-vision';

export const runtime = 'edge'; // Use Edge runtime for faster response
export const maxDuration = 10; // 10 seconds max (Vercel Hobby limit)

/**
 * Trigger immediate AI processing for a job.
 * Fire-and-forget: we don't await this to avoid blocking the upload response.
 */
async function triggerImmediateProcessing(jobId: string, host: string | null) {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (host ? `https://${host}` : 'http://localhost:3000');

  const cronSecret = process.env.CRON_SECRET;

  // Fire-and-forget fetch - don't wait for response
  // Use no-wait pattern to avoid blocking this route
  fetch(`${baseUrl}/api/cron/process-ai-jobs?jobId=${jobId}`, {
    method: 'POST',
    headers: {
      Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
    },
    // Keepalive ensures the request continues even if this response finishes
    keepalive: true,
  }).catch((err) => {
    // Log error but don't fail the upload - cron will pick it up anyway
    console.error('Immediate trigger failed, cron will handle:', err.message);
  });
}

/**
 * POST /api/upload
 *
 * Uploads a food image and creates a pending AI job.
 * Returns job ID for client-side polling.
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check AI scan rate limit
    const scanCount = await getUserDailyAiScanCount(userId);
    const dailyLimit = parseInt(process.env.AI_SCAN_LIMIT_FREE || '5', 10);

    if (scanCount >= dailyLimit) {
      return NextResponse.json(
        {
          error: 'Daily AI scan limit reached',
          limit: dailyLimit,
          used: scanCount,
          resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        },
        { status: 429 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const mealTypeHint = formData.get('mealType') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Max size is 10MB.' },
        { status: 400 }
      );
    }

    // Convert File to Buffer for Vercel Blob
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Vercel Blob
    const imageUrl = await uploadFoodImage(buffer, userId);

    // Create image hash for caching
    const imageHash = await createImageHash(imageUrl);

    // Create pending AI job with optional meal type hint
    const [job] = await db
      .insert(aiJobs)
      .values({
        userId,
        imageUrl,
        imageHash,
        status: 'pending',
        cachedAnalysis: mealTypeHint ? JSON.stringify({ mealTypeHint }) : null,
      })
      .returning();

    // Fire-and-forget: trigger immediate processing
    // Don't await this - let it run in background
    const host = request.headers.get('host');
    triggerImmediateProcessing(job.id, host);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      imageUrl,
      message: 'Image uploaded. AI processing started.',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
