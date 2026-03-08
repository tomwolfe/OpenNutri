/**
 * Cleanup Orphaned Blob Images
 *
 * Deletes images from Vercel Blob that are:
 * - Older than 7 days
 * - Not referenced by any food_log in the database
 *
 * Run weekly via Vercel Cron or manually.
 */

import { neon } from '@neondatabase/serverless';
import { list, del } from '@vercel/blob';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

/**
 * Configuration
 */
const MAX_AGE_DAYS = 7; // Delete images older than 7 days
const BATCH_SIZE = 100; // Process in batches to avoid rate limits

/**
 * Get all image URLs referenced in food_logs
 * Note: Currently images are deleted after save, so this is for future-proofing
 */
async function getReferencedImageUrls(): Promise<Set<string>> {
  try {
    // Check if image_url column exists in food_logs
    const columnCheck: any = await sql.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'food_logs' AND column_name = 'image_url';
    `);
    
    const columns = Array.isArray(columnCheck) ? columnCheck : columnCheck?.rows || [];
    
    if (columns.length === 0) {
      // No image_url column in food_logs (current architecture)
      // All blobs are potentially orphaned if not cleaned up on cancel
      return new Set();
    }

    const result: any = await sql.query(`
      SELECT DISTINCT image_url 
      FROM food_logs 
      WHERE image_url IS NOT NULL;
    `);

    const rows = Array.isArray(result) ? result : result?.rows || [];
    return new Set(rows.map((r: any) => r.image_url));
  } catch (error) {
    console.error('Error checking referenced images:', error);
    return new Set();
  }
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
 * Check if a blob is orphaned (not referenced and old enough)
 */
function isOrphanedBlob(
  blob: { url: string; uploadedAt: Date },
  referencedUrls: Set<string>,
  cutoffDate: Date
): boolean {
  // Check if referenced in database
  if (referencedUrls.has(blob.url)) {
    return false;
  }

  // Check if old enough to be considered orphaned
  if (blob.uploadedAt > cutoffDate) {
    return false; // Too recent to be orphaned
  }

  return true;
}

/**
 * Main cleanup function
 */
async function cleanupOrphanedBlobs() {
  console.log('🧹 Starting orphaned blob cleanup...\n');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);

  console.log(`📅 Cutoff date: ${cutoffDate.toISOString()}`);
  console.log(`   (Deleting blobs older than ${MAX_AGE_DAYS} days not referenced in DB)\n`);

  // Get referenced images
  console.log('🔍 Checking database for referenced images...');
  const referencedUrls = await getReferencedImageUrls();
  console.log(`   Found ${referencedUrls.size} referenced image(s)\n`);

  // Get all blobs
  console.log('📦 Fetching all blobs from Vercel Blob...');
  const allBlobs = await getAllBlobs();
  console.log(`   Found ${allBlobs.length} blob(s)\n`);

  // Filter to user food images only
  const userFoodBlobs = allBlobs.filter((b) =>
    b.pathname.startsWith('users/')
  );
  console.log(`   ${userFoodBlobs.length} user food image(s)\n`);

  // Identify orphans
  const orphans = userFoodBlobs.filter((blob) =>
    isOrphanedBlob(blob, referencedUrls, cutoffDate)
  );

  console.log(`🗑️  Found ${orphans.length} orphaned blob(s) to delete\n`);

  if (orphans.length === 0) {
    console.log('✅ No orphaned blobs found. Cleanup complete!\n');
    return;
  }

  // Delete orphans
  let deletedCount = 0;
  let failedCount = 0;

  for (const orphan of orphans) {
    try {
      await del(orphan.url);
      deletedCount++;
      console.log(`   ✓ Deleted: ${orphan.pathname}`);
    } catch (error) {
      failedCount++;
      console.error(`   ✗ Failed to delete: ${orphan.pathname}`, error);
    }

    // Rate limit protection
    if (deletedCount % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Deleted: ${deletedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log(`   Total processed: ${orphans.length}\n`);
}

// Run cleanup
cleanupOrphanedBlobs().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
