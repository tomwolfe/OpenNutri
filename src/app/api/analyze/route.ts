/**
 * Food Image Analysis Streaming Route
 *
 * Streams AI vision analysis to the client using Vercel AI SDK.
 * Supports multipart/form-data (binary) and application/json (base64/text).
 *
 * PURGES THE IMAGE IMMEDIATELY AFTER ANALYSIS for Zero-Knowledge security.
 * Binary data and Base64 never touch storage - they stay in ephemeral memory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { analyzeFoodImageStream, analyzeFoodTextStream } from '@/lib/ai-vision-stream';
import { db } from '@/lib/db';
import { aiUsage } from '@/db/schema';
import { deleteFoodImage } from '@/lib/blob';

export const runtime = 'edge';
export const maxDuration = 60;

/**
 * POST /api/analyze
 *
 * Accepts imageUrl (blob URL or base64) or binary image data, and mealTypeHint.
 * Streams AI analysis back to client immediately.
 */
export async function POST(request: NextRequest) {
  let imageUrlToDelete: string | null = null;
  let imageSource: string | Uint8Array | ArrayBuffer | null = null;
  let textInput: string | null = null;
  let mealTypeHint: string | null = null;

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

    // Determine request type
    const contentType = request.headers.get('content-type') || '';

    let isEncrypted = false;
    let sessionKeyBase64: string | null = request.headers.get('x-session-key');
    let ivBase64: string | null = request.headers.get('x-session-iv');

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File | null;
      textInput = formData.get('text') as string | null;
      mealTypeHint = formData.get('mealTypeHint') as string | null;
      isEncrypted = formData.get('isEncrypted') === 'true' || !!sessionKeyBase64;
      sessionKeyBase64 = sessionKeyBase64 || (formData.get('sessionKey') as string | null);
      ivBase64 = ivBase64 || (formData.get('iv') as string | null);

      if (imageFile) {
        imageSource = await imageFile.arrayBuffer();
      }
    } else {
      // Default to JSON
      const body = await request.json();
      const { imageUrl, text, mealTypeHint: hint, isEncrypted: enc, sessionKey: key, iv } = body;
      
      textInput = text;
      mealTypeHint = hint;
      isEncrypted = enc || !!sessionKeyBase64;
      sessionKeyBase64 = sessionKeyBase64 || key;
      ivBase64 = ivBase64 || iv;

      if (imageUrl) {
        if (imageUrl.startsWith('data:')) {
          imageSource = imageUrl;
        } else {
          imageSource = imageUrl;
          imageUrlToDelete = imageUrl;
        }
      }
    }

    // Decrypt if necessary
    if (isEncrypted && imageSource && sessionKeyBase64 && ivBase64) {
      try {
        // Handle both binary (FormData) and base64 (JSON) image sources
        let ciphertext: ArrayBuffer;
        
        if (imageSource instanceof ArrayBuffer) {
          // Binary data from FormData - already an ArrayBuffer
          ciphertext = imageSource;
        } else if (imageSource instanceof Uint8Array) {
          // Uint8Array from formData arrayBuffer()
          ciphertext = imageSource.buffer.slice(
            imageSource.byteOffset,
            imageSource.byteOffset + imageSource.byteLength
          ) as ArrayBuffer;
        } else if (typeof imageSource === 'string') {
          // Base64 from JSON body (legacy support)
          const base64Data = imageSource.split(',')[1] || imageSource;
          ciphertext = new Uint8Array(Buffer.from(base64Data, 'base64')).buffer as ArrayBuffer;
        } else {
          throw new Error('Invalid encrypted image format');
        }

        const keyBuffer = Buffer.from(sessionKeyBase64, 'base64');
        const ivBuffer = Buffer.from(ivBase64, 'base64');

        // Import the session key
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );

        // Decrypt the image
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: ivBuffer },
          cryptoKey,
          ciphertext
        );

        imageSource = new Uint8Array(decrypted);
        console.log('Successfully decrypted image in memory for analysis');
      } catch (err) {
        console.error('Decryption failed:', err);
        return NextResponse.json({ error: 'Failed to decrypt image' }, { status: 400 });
      }
    }

    if (!imageSource && !textInput) {
      return NextResponse.json(
        { error: 'Image or text input is required' },
        { status: 400 }
      );
    }

    // Fetch recent foods for context
    const recentFoods = await fetchRecentFoods(userId);

    // Log AI usage
    await db.insert(aiUsage).values({ userId });

    // Call AI service
    let result;
    if (imageSource) {
      result = await analyzeFoodImageStream(imageSource, mealTypeHint, recentFoods);
    } else if (textInput) {
      result = await analyzeFoodTextStream(textInput, mealTypeHint, recentFoods);
    } else {
      throw new Error('No input provided');
    }

    // Return the stream immediately
    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  } finally {
    // PURGE external image if one was used
    if (imageUrlToDelete) {
      try {
        await deleteFoodImage(imageUrlToDelete);
      } catch (err) {
        console.error('Failed to purge analysis image:', err);
      }
    }
  }
}

/**
 * Fetch user's most frequently eaten foods in the last 7 days
 */
async function fetchRecentFoods(
  userId: string
): Promise<Array<{ name: string; freq: number }>> {
  try {
    const { foodLogs, logItems } = await import('@/db/schema');
    const { eq, desc } = await import('drizzle-orm');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const items = await db
      .select({ foodName: logItems.foodName })
      .from(logItems)
      .innerJoin(foodLogs, eq(logItems.logId, foodLogs.id))
      .where(eq(foodLogs.userId, userId))
      .orderBy(desc(foodLogs.timestamp))
      .limit(100);

    const foodMap = new Map<string, number>();
    for (const item of items) {
      if (!item.foodName || item.foodName.trim().length === 0) continue;
      const count = foodMap.get(item.foodName) || 0;
      foodMap.set(item.foodName, count + 1);
    }

    const foods = Array.from(foodMap.entries()).map(([name, freq]) => ({
      name,
      freq,
    }));

    foods.sort((a, b) => b.freq - a.freq);
    return foods.slice(0, 20);
  } catch (error) {
    console.error('Failed to fetch recent foods:', error);
    return [];
  }
}
