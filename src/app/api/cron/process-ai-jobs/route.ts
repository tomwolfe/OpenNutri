/**
 * Vercel Cron Worker: Process AI Jobs
 *
 * This endpoint is triggered by Vercel Cron on a schedule.
 * It processes pending AI vision jobs from the queue.
 *
 * Cron Schedule Configuration (vercel.json):
 * - Every 1 minute: /api/cron/process-ai-jobs
 *
 * Security: Protected by cron secret header
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAiJobsQueue } from '@/workers/ai-jobs-processor';
import { auth } from '@/lib/auth';

export const runtime = 'edge';

/**
 * POST /api/cron/process-ai-jobs
 *
 * Triggered by Vercel Cron to process pending AI jobs.
 * Can also be triggered with ?jobId=xxx for immediate processing.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret (if configured)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Skip secret check in development
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      // Fallback: Check if the request is coming from an authenticated client session
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  try {
    // Check if this is an immediate trigger for a specific job
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    const result = await processAiJobsQueue(jobId || undefined);

    return NextResponse.json({
      ...result,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/process-ai-jobs
 *
 * Manual trigger for testing (development only).
 */
export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Manual trigger disabled in production' },
      { status: 403 }
    );
  }

  try {
    const result = await processAiJobsQueue();

    return NextResponse.json({
      ...result,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Manual cron trigger failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
