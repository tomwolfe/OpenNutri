/**
 * Food Image Analysis Streaming Route
 *
 * Streams AI vision analysis to the client using Vercel AI SDK.
 * Expects image to be already uploaded to Vercel Blob.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { analyzeFoodImageStream } from '@/lib/glm-vision-stream';
import { db } from '@/lib/db';
import { aiUsage } from '@/db/schema';

export const runtime = 'edge';
export const maxDuration = 60;

/**
 * POST /api/analyze
 *
 * Accepts imageUrl and mealTypeHint, streams AI analysis back to client.
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
        { error: 'Daily AI scan limit reached' },
        { status: 429 }
      );
    }

    // Parse request body
    const { imageUrl, mealTypeHint } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Log AI usage BEFORE starting analysis
    await db.insert(aiUsage).values({ userId });

    // Fetch recent foods for context (last 7 days, top 5 most frequent)
    const recentFoods = await fetchRecentFoods(userId);

    // Call GLM Vision API with streaming
    const result = await analyzeFoodImageStream(imageUrl, mealTypeHint, recentFoods);

    // Return using AI SDK's native streaming response
    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}

/**
 * Fetch user's most frequently eaten foods in the last 7 days
 */
async function fetchRecentFoods(userId: string): Promise<string[]> {
  try {
    const { foodLogs, logItems } = await import('@/db/schema');
    const { eq, desc } = await import('drizzle-orm');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const items = await db
      .select({
        foodName: logItems.foodName,
      })
      .from(logItems)
      .innerJoin(foodLogs, eq(logItems.logId, foodLogs.id))
      .where(
        eq(foodLogs.userId, userId)
      )
      .orderBy(desc(foodLogs.timestamp))
      .limit(20);

    // Get unique food names, filter out empty/null
    const uniqueFoods = Array.from(
      new Set(
        items
          .map((item) => item.foodName)
          .filter((name): name is string => !!name && name.trim().length > 0)
      )
    );

    // Return top 5
    return uniqueFoods.slice(0, 5);
  } catch (error) {
    console.error('Failed to fetch recent foods:', error);
    return [];
  }
}
