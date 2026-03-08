/**
 * AI Rate Limiting and Quota Management
 *
 * Implements daily scan limits for free tier users.
 * Uses ai_usage table to track API executions (not just saved logs).
 */

import { db } from '@/lib/db';
import { aiUsage, users } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Get the number of AI scans a user has performed today
 * Counts ai_usage entries (API executions, regardless of save)
 * @param userId - User ID to check
 * @returns Number of AI scans today
 */
export async function getUserDailyAiScanCount(userId: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Strict UTC midnight reset

  // Count ai_usage entries (API executions)
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        gte(aiUsage.timestamp, today)
      )
    );

  return Number(result[0]?.count ?? 0);
}

/**
 * Check if user has reached their daily AI scan limit
 * @param userId - User ID to check
 * @returns True if limit is reached, false otherwise
 */
export async function hasReachedAiLimit(userId: string): Promise<boolean> {
  const scanCount = await getUserDailyAiScanCount(userId);
  const dailyLimit = parseInt(process.env.AI_SCAN_LIMIT_FREE || '5', 10);

  // Check user's subscription tier
  const [user] = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Premium users get higher limits (can be customized)
  const effectiveLimit =
    user?.subscriptionTier === 'premium' ? dailyLimit * 5 : dailyLimit;

  return scanCount >= effectiveLimit;
}

/**
 * Get remaining AI scans for today
 * @param userId - User ID to check
 * @returns Number of remaining scans
 */
export async function getRemainingAiScans(userId: string): Promise<number> {
  const scanCount = await getUserDailyAiScanCount(userId);
  const dailyLimit = parseInt(process.env.AI_SCAN_LIMIT_FREE || '5', 10);

  const [user] = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const effectiveLimit =
    user?.subscriptionTier === 'premium' ? dailyLimit * 5 : dailyLimit;

  return Math.max(0, effectiveLimit - scanCount);
}
