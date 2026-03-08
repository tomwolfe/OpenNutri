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

    // Call GLM Vision API with streaming
    const result = await analyzeFoodImageStream(imageUrl, mealTypeHint);

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
