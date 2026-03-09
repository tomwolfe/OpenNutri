/**
 * Cron Job: Cleanup Orphaned Blobs
 *
 * Runs hourly to delete orphaned images from Vercel Blob.
 * Protected by CRON_SECRET.
 *
 * Schedule: Every hour at minute 0
 */

import { NextRequest, NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for cleanup

/**
 * Configuration
 */
const MAX_AGE_HOURS = 1; // 1 hour - aggressive cleanup for zero-knowledge privacy
const BATCH_SIZE = 100;

/**
 * Verify cron authentication
 */
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow Vercel cron header
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader === 'true') {
    return true;
  }

  // Check secret
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

/**
 * Get all blobs from Vercel Blob storage
 */
async function getAllBlobs() {
  const allBlobs: Array<{ url: string; pathname: string; uploadedAt: Date }> = [];
  let cursor: string | undefined;

  do {
    const result = await list({ cursor, limit: BATCH_SIZE });
    allBlobs.push(
      ...result.blobs.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        uploadedAt: b.uploadedAt,
      }))
    );
    cursor = result.cursor;
  } while (cursor);

  return allBlobs;
}

/**
 * Main cleanup function
 */
async function performCleanup() {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - MAX_AGE_HOURS);

  // Get all blobs
  const allBlobs = await getAllBlobs();
  const userFoodBlobs = allBlobs.filter((b) => b.pathname.startsWith('users/'));

  // Filter to orphans (older than cutoff)
  const orphans = userFoodBlobs.filter(
    (blob) => blob.uploadedAt < cutoffDate
  );

  if (orphans.length === 0) {
    return { deleted: 0, failed: 0, total: 0 };
  }

  // Delete orphans
  let deletedCount = 0;
  let failedCount = 0;

  for (const orphan of orphans) {
    try {
      await del(orphan.url);
      deletedCount++;
    } catch (error) {
      failedCount++;
      console.error(`Failed to delete ${orphan.pathname}:`, error);
    }

    // Rate limit protection
    if (deletedCount % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { deleted: deletedCount, failed: failedCount, total: orphans.length };
}

export async function GET(request: NextRequest) {
  // Verify authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await performCleanup();

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed',
      ...result,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
