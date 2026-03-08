/**
 * Food Image Analysis Streaming Route
 *
 * Streams AI vision analysis to the client using Vercel AI SDK.
 * Expects image to be already uploaded to Vercel Blob.
 *
 * AI usage is logged atomically AFTER successful analysis (confidence > 0.5).
 * Server-side USDA enrichment is performed on detected foods.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { analyzeFoodImageStream, analyzeFoodTextStream } from '@/lib/ai-vision-stream';
import { db } from '@/lib/db';
import { aiUsage } from '@/db/schema';
import { enhanceWithUSDAData } from '@/lib/ai-usda-bridge';
import { deleteFoodImage } from '@/lib/blob';

export const runtime = 'edge';
export const maxDuration = 60;

/**
 * POST /api/analyze
 *
 * Accepts imageUrl and mealTypeHint, streams AI analysis back to client.
 * Buffers complete AI result, enriches with USDA data server-side, then streams response.
 * Only logs AI usage if at least one item is identified with confidence > 0.5.
 * 
 * PURGES THE IMAGE IMMEDIATELY AFTER ANALYSIS for Zero-Knowledge security.
 */
export async function POST(request: NextRequest) {
  let imageUrlToDelete: string | null = null;

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
    const { imageUrl, text, mealTypeHint } = await request.json();

    if (!imageUrl && !text) {
      return NextResponse.json(
        { error: 'Image URL or text is required' },
        { status: 400 }
      );
    }

    // Track image for deletion after analysis (only if it's a Vercel Blob URL, not Base64)
    // Base64 images are held in memory and automatically discarded after function execution
    if (imageUrl && !imageUrl.startsWith('data:')) {
      imageUrlToDelete = imageUrl;
    }

    // Fetch recent foods for context (last 7 days, top 20 most frequent)
    const recentFoods = await fetchRecentFoods(userId);

    // Call appropriate GLM API (Vision or Text)
    let result;
    if (imageUrl) {
      result = await analyzeFoodImageStream(imageUrl, mealTypeHint, recentFoods);
    } else {
      result = await analyzeFoodTextStream(text, mealTypeHint, recentFoods);
    }

    const textStream = await result.toTextStreamResponse();
    const fullText = await new Response(textStream.body).text();

    // Parse the AI result
    let hasHighConfidence = false;
    let enrichedResponse: string = fullText;

    const jsonMatch = fullText.match(/\{[^{}]*"items"[^{}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.items && Array.isArray(parsed.items)) {
        // Check for high confidence items before enrichment
        hasHighConfidence = parsed.items.some(
          (item: { confidence?: number }) => (item.confidence || 0) > 0.5
        );

        // Perform USDA enrichment server-side
        const usdaItems = parsed.items.map((item: {
          name: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          confidence: number;
          portion_guess: string;
          numeric_quantity: number;
          unit: string;
          notes?: string;
        }) => ({
          name: item.name,
          calories: item.calories || 0,
          protein_g: item.protein_g || 0,
          carbs_g: item.carbs_g || 0,
          fat_g: item.fat_g || 0,
          confidence: item.confidence || 0,
          portion_guess: item.portion_guess || '',
          numeric_quantity: item.numeric_quantity || 1,
          unit: item.unit || 'serving',
          notes: item.notes,
        }));

        const enhancedItems = await enhanceWithUSDAData(usdaItems);

        // Transform enhanced items back to the expected format
        const transformedItems = enhancedItems.map((item, index) => ({
          name: item.foodName,
          calories: item.calories,
          protein_g: item.protein,
          carbs_g: item.carbs,
          fat_g: item.fat,
          confidence: usdaItems[index]?.confidence || 0.7,
          portion_guess: usdaItems[index]?.portion_guess || '',
          numeric_quantity: usdaItems[index]?.numeric_quantity || 1,
          unit: usdaItems[index]?.unit || 'serving',
          notes: usdaItems[index]?.notes,
          source: item.source,
          usdaMatch: item.usdaMatch,
        }));

        enrichedResponse = JSON.stringify({
          items: transformedItems,
        });
      }
    }

    // Log AI usage if high confidence items were found
    if (hasHighConfidence) {
      await db.insert(aiUsage).values({ userId });
    }

    // Stream the enriched response back to client
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(enrichedResponse));
          controller.close();
        },
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }
    );
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  } finally {
    // PURGE the unencrypted image from Vercel Blob storage (if applicable)
    // Base64 images never touch storage - they're held in memory and automatically discarded
    // This ensures Zero-Knowledge: plaintext images never persist on our servers
    if (imageUrlToDelete) {
      try {
        await deleteFoodImage(imageUrlToDelete);
        console.log(`Successfully purged analysis image: ${imageUrlToDelete}`);
      } catch (err) {
        console.error('Failed to purge analysis image from Blob storage:', err);
      }
    }
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
      .limit(100);

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

    // Sort by frequency and return top 20 (increased from 5 for better context)
    foods.sort((a, b) => b.freq - a.freq);
    return foods.slice(0, 20);
  } catch (error) {
    console.error('Failed to fetch recent foods:', error);
    return [];
  }
}
