/**
 * Food Image Analysis Streaming Route
 *
 * Streams AI vision analysis to the client using Vercel AI SDK.
 * Expects image to be already uploaded to Vercel Blob.
 *
 * AI usage is logged atomically AFTER successful analysis (confidence > 0.5).
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
 * Only logs AI usage if at least one item is identified with confidence > 0.5.
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check AI scan rate limit BEFORE starting analysis
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

    // Fetch recent foods for context (last 7 days, top 20 most frequent)
    const recentFoods = await fetchRecentFoods(userId);

    // Call GLM Vision API with streaming
    const result = await analyzeFoodImageStream(imageUrl, mealTypeHint, recentFoods);

    // Create a custom stream that logs AI usage only on successful completion
    let accumulatedResult = '';

    // Transform the stream to capture the result and log usage on success
    const loggedStream = result.toTextStreamResponse().body!.pipeThrough(
      new TransformStream({
        async transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          accumulatedResult += text;
          controller.enqueue(chunk);
        },
        async flush() {
          // Only log AI usage if we got a successful result with confidence > 0.5
          if (accumulatedResult) {
            try {
              // Try to parse the streamed JSON to check for successful items
              const jsonMatch = accumulatedResult.match(/\{[^{}]*"items"[^{}]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.items && Array.isArray(parsed.items)) {
                  const hasHighConfidence = parsed.items.some(
                    (item: { confidence?: number }) => (item.confidence || 0) > 0.5
                  );
                  if (hasHighConfidence) {
                    await db.insert(aiUsage).values({ userId });
                  }
                }
              }
            } catch (parseError) {
              // If parsing fails, don't log the scan (stream may have been incomplete)
              console.warn('Failed to parse AI result for usage logging:', parseError);
            }
          }
        },
      })
    );

    return new Response(loggedStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}

/**
 * Fetch user's most frequently eaten foods in the last 7 days with frequency data
 */
async function fetchRecentFoods(
  userId: string
): Promise<
  Array<{
    name: string;
    freq: number;
  }>
> {
  try {
    const { foodLogs, logItems } = await import('@/db/schema');
    const { eq, desc } = await import('drizzle-orm');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch food items from the last 7 days
    const items = await db
      .select({
        foodName: logItems.foodName,
      })
      .from(logItems)
      .innerJoin(foodLogs, eq(logItems.logId, foodLogs.id))
      .where(eq(foodLogs.userId, userId))
      .orderBy(desc(foodLogs.timestamp))
      .limit(50);

    // Aggregate by food name: calculate frequency
    const foodMap = new Map<string, number>();

    for (const item of items) {
      if (!item.foodName || item.foodName.trim().length === 0) continue;

      const count = foodMap.get(item.foodName) || 0;
      foodMap.set(item.foodName, count + 1);
    }

    // Convert to array with frequency
    const foods = Array.from(foodMap.entries()).map(([name, freq]) => ({
      name,
      freq,
    }));

    // Sort by frequency and return top 5
    foods.sort((a, b) => b.freq - a.freq);
    return foods.slice(0, 5);
  } catch (error) {
    console.error('Failed to fetch recent foods:', error);
    return [];
  }
}
