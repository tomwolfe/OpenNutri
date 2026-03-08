/**
 * Image Upload API Route
 *
 * Handles food image uploads for AI vision processing.
 * Creates an AI job in 'pending' status and returns job ID.
 * Client will poll for status while Vercel Cron processes the job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadFoodImage } from '@/lib/blob';
import { db } from '@/lib/db';
import { aiJobs } from '@/db/schema';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';

export const runtime = 'edge'; // Use Edge runtime for faster response
export const maxDuration = 10; // 10 seconds max (Vercel Hobby limit)

/**
 * POST /api/upload
 *
 * Uploads a food image and creates a pending AI job.
 * Returns job ID for client-side polling.
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
        {
          error: 'Daily AI scan limit reached',
          limit: dailyLimit,
          used: scanCount,
          resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        },
        { status: 429 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Max size is 10MB.' },
        { status: 400 }
      );
    }

    // Convert File to Buffer for Vercel Blob
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Vercel Blob
    const imageUrl = await uploadFoodImage(buffer, userId);

    // Create pending AI job
    const [job] = await db
      .insert(aiJobs)
      .values({
        userId,
        imageUrl,
        status: 'pending',
      })
      .returning();

    return NextResponse.json({
      success: true,
      jobId: job.id,
      imageUrl,
      message: 'Image uploaded. AI processing started.',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
