/**
 * Food Image Analysis Streaming Route
 *
 * Streams AI vision analysis directly to the client.
 * Uses native Web Streams API to keep connection alive during long-running AI inference.
 *
 * Flow:
 * 1. Upload image to Vercel Blob
 * 2. Stream GLM Vision API response
 * 3. Client receives tokens in real-time
 *
 * This avoids polling and background jobs entirely.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadFoodImage } from '@/lib/blob';
import { getUserDailyAiScanCount } from '@/lib/ai-limits';
import { analyzeFoodImageStream } from '@/lib/glm-vision-stream';
import { enhanceWithUSDAData } from '@/lib/ai-usda-bridge';

export const runtime = 'edge';
export const maxDuration = 120; // Allow up to 2 minutes for streaming

/**
 * Create a streaming response encoder
 */
function createStreamResponse() {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
  });

  const write = (data: unknown) => {
    if (streamController) {
      const json = JSON.stringify(data);
      streamController.enqueue(encoder.encode(`0:${json}\n`));
    }
  };

  const close = () => {
    if (streamController) {
      streamController.close();
      streamController = null;
    }
  };

  const error = (message: string) => {
    if (streamController) {
      const json = JSON.stringify({ type: 'error', error: message });
      streamController.enqueue(encoder.encode(`0:${json}\n`));
      streamController.close();
      streamController = null;
    }
  };

  return { stream, write, close, error };
}

/**
 * POST /api/analyze
 *
 * Uploads image and streams AI analysis back to client.
 */
export async function POST(request: NextRequest) {
  const { stream, write, close, error } = createStreamResponse();

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
      error('Daily AI scan limit reached');
      return new Response(stream, {
        status: 429,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const mealTypeHint = formData.get('mealType') as string | null;

    if (!file) {
      error('No image provided');
      return new Response(stream, {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      error('Invalid file type. Please upload an image.');
      return new Response(stream, {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      error('File too large. Max size is 10MB.');
      return new Response(stream, {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Upload to Vercel Blob (File is natively supported)
    const imageUrl = await uploadFoodImage(file, userId);

    // Send initial status
    write({
      type: 'status',
      status: 'analyzing',
      message: 'Image uploaded, analyzing with AI...',
    });

    // Start AI analysis (async, non-blocking)
    (async () => {
      try {
        // Call GLM Vision API with streaming
        const { fullStream } = analyzeFoodImageStream(imageUrl, mealTypeHint);

        type AnalysisResult = {
          items: Array<{
            name: string;
            calories: number;
            protein_g: number;
            carbs_g: number;
            fat_g: number;
            confidence: number;
            portion_guess: string;
          }>;
        };

        let analysisResult: AnalysisResult | null = null;

        // Collect the streamed response
        for await (const chunk of fullStream) {
          if (chunk.type === 'object') {
            const obj = chunk.object as Partial<AnalysisResult>;
            if (obj.items && obj.items.length > 0) {
              analysisResult = obj as AnalysisResult;
              
              // Stream partial items to the client in real-time
              write({
                type: 'partial',
                items: obj.items
              });
            }
          }
        }

        if (!analysisResult || analysisResult.items.length === 0) {
          error('AI analysis returned no results');
          return;
        }

        write({
          type: 'status',
          status: 'enhancing',
          message: 'Enhancing with USDA data...',
        });

        // Enhance AI results with USDA data
        const enhancedItems = await enhanceWithUSDAData(analysisResult.items);

        const usdaMatchCount = enhancedItems.filter(
          (item) => item.source === 'USDA'
        ).length;

        // Calculate confidence and calories
        const avgConfidence = analysisResult.items.reduce(
          (sum, item) => sum + (item.confidence || 0),
          0
        ) / analysisResult.items.length;

        const totalCalories = enhancedItems.reduce(
          (sum, item) => sum + item.calories,
          0
        );

        // Convert to draft format
        const draftItems = enhancedItems.map((item) => ({
          foodName: item.foodName,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          source: item.source,
          servingGrams: 100, // Default serving size
          usdaMatch: 'usdaMatch' in item ? item.usdaMatch : undefined,
        }));

        // Send final result
        write({
          type: 'result',
          items: draftItems,
          totalCalories,
          aiConfidenceScore: avgConfidence,
          usdaMatchCount,
          imageUrl,
        });

        close();
      } catch (analyzeError) {
        console.error('Analysis error:', analyzeError);
        error(analyzeError instanceof Error ? analyzeError.message : 'Analysis failed');
      }
    })();

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (uploadError) {
    console.error('Upload error:', uploadError);
    error(uploadError instanceof Error ? uploadError.message : 'Failed to process image');
    return new Response(stream, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
