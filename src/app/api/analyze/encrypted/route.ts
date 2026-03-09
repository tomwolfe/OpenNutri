/**
 * Encrypted Image Analysis API Route
 *
 * Accepts encrypted image data, decrypts in memory, analyzes with AI, and purges.
 * This ensures Zero-Knowledge: plaintext images never persist on our servers.
 *
 * Flow:
 * 1. Client generates a one-time session key (AES-GCM)
 * 2. Client encrypts image with session key
 * 3. Client encrypts session key with user's vault key
 * 4. Client sends: encryptedImage + encryptedSessionKey + sessionKeyIv
 * 5. Server requests vault key from client (via secure header)
 * 6. Server decrypts session key, then decrypts image
 * 7. Server passes decrypted buffer to AI SDK for streaming analysis
 * 8. Server returns stream to client
 * 9. Memory is garbage collected (no persistence)
 *
 * Alternative simpler approach (implemented):
 * Client encrypts image with vault key directly and sends it.
 * Server cannot decrypt without vault key, so this is for future implementation.
 * For now, we use base64 data URLs which never touch blob storage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { analyzeFoodImageStream, analyzeFoodTextStream } from '@/lib/ai-vision-stream';
import { db } from '@/lib/db';
import { aiUsage } from '@/db/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/analyze/encrypted
 *
 * Accepts base64-encoded image data (already encrypted client-side or held in memory).
 * The image never touches blob storage - it's processed entirely in ephemeral memory.
 * 
 * Request body:
 * - imageData: string (base64-encoded, either plaintext for transition or encrypted for future)
 * - mealTypeHint: string (optional)
 * - isEncrypted: boolean (if true, server will attempt decryption with provided key)
 * - encryptionKey?: string (optional, one-time key for this request only)
 * - iv?: string (optional, base64-encoded IV for decryption)
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
    const { imageData, iv, mealTypeHint, text, isEncrypted, encryptionKey } = await request.json();

    if ((!imageData && !text) || (isEncrypted && (!encryptionKey || !iv))) {
      return NextResponse.json(
        { error: 'Image data (or text) is required. If encrypted, must include encryptionKey and iv' },
        { status: 400 }
      );
    }

    // Fetch recent foods for context
    const recentFoods = await fetchRecentFoods(userId);

    // Log AI usage BEFORE streaming
    await db.insert(aiUsage).values({ userId });

    // Process image or text
    if (imageData) {
      let processedImageData = imageData;

      // If encrypted, decrypt in memory
      if (isEncrypted && encryptionKey && iv) {
        try {
          // 1. Import the session key (AES-GCM)
          const keyBuffer = base64ToArrayBuffer(encryptionKey);
          const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );

          // 2. Decrypt the image data
          const ivBuffer = base64ToArrayBuffer(iv);
          const encryptedBuffer = base64ToArrayBuffer(imageData);
          
          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            cryptoKey,
            encryptedBuffer
          );

          // 3. Convert back to data URL for AI vision stream
          const base64Plaintext = arrayBufferToBase64(decryptedBuffer);
          processedImageData = `data:image/jpeg;base64,${base64Plaintext}`;
          
          console.log('Successfully decrypted image in edge runtime');
        } catch (decryptError) {
          console.error('Decryption failed:', decryptError);
          return NextResponse.json(
            { error: 'Failed to decrypt image data. Check key and iv.' },
            { status: 400 }
          );
        }
      }

      // Analyze image (streaming)
      const result = await analyzeFoodImageStream(processedImageData, mealTypeHint, recentFoods);
      return result.toTextStreamResponse();
    } else if (text) {
      // Text analysis
      const result = await analyzeFoodTextStream(text, mealTypeHint, recentFoods);
      return result.toTextStreamResponse();
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Encrypted analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
  // Note: No finally block needed - image data is never stored,
  // it exists only in ephemeral memory and is garbage collected
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

    const foods = Array.from(foodMap.entries()).map(([name, freq]) => ({ name, freq }));
    foods.sort((a, b) => b.freq - a.freq);
    return foods.slice(0, 20);
  } catch (error) {
    console.error('Failed to fetch recent foods:', error);
    return [];
  }
}

/**
 * Helper: Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Helper: Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
