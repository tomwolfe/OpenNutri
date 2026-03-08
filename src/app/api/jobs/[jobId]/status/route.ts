/**
 * Job Status API
 *
 * Returns the status of an AI job for client-side polling.
 * Includes job status, progress, and results when completed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiJobs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'edge';
export const maxDuration = 10;

/**
 * GET /api/jobs/[jobId]/status
 *
 * Returns job status and results if completed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const jobId = params.jobId;

    // Fetch job status
    const [job] = await db
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.userId, userId)))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Build response based on status
    const response: {
      jobId: string;
      status: string;
      createdAt: string;
      completedAt?: string;
      imageUrl?: string | null;
      foodLog?: {
        id: string;
        totalCalories: number;
        aiConfidenceScore: number;
        mealType: string;
        isVerified: boolean;
        items: Array<{
          foodName: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          source: string;
        }>;
      };
      error?: string;
    } = {
      jobId: job.id,
      status: job.status ?? 'pending',
      createdAt: job.createdAt?.toISOString() ?? new Date().toISOString(),
      imageUrl: job.imageUrl,
    };

    if (job.completedAt) {
      response.completedAt = job.completedAt.toISOString();
    }

    // If completed, check for draft analysis
    if (job.status === 'completed' && job.draftAnalysis) {
      try {
        const draftAnalysis = JSON.parse(job.draftAnalysis) as {
          items: Array<{
            foodName: string;
            calories: number;
            protein: number;
            carbs: number;
            fat: number;
            source: string;
          }>;
          totalCalories: number;
          aiConfidenceScore: number;
          analyzedAt: string;
        };

        response.foodLog = {
          id: job.id, // Use job ID as draft ID
          totalCalories: draftAnalysis.totalCalories || 0,
          aiConfidenceScore: draftAnalysis.aiConfidenceScore || 0,
          mealType: 'unclassified', // Will be set by user
          isVerified: false, // Draft needs confirmation
          items: draftAnalysis.items || [],
        };
      } catch (e) {
        console.error('Failed to parse draftAnalysis:', e);
      }
    }

    // If failed, include error info
    if (job.status === 'failed') {
      response.error = job.errorMessage || 'AI processing failed. Please try again.';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Job status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}
