/**
 * Create Food Log API Route
 * POST /api/log/food
 *
 * Supports two modes:
 * 1. Manual entry: Creates new food log from scratch
 * 2. Draft confirmation: Upgrades AI draft (cachedAnalysis) to verified log
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, logItems, aiJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { mealType, items, totalCalories, jobId } = body;

    // Validate request
    if (!mealType || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Handle draft confirmation (AI scan review)
    if (jobId) {
      // Verify the job belongs to the user
      const [job] = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.id, jobId))
        .limit(1);

      if (!job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      if (job.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Create verified food log from draft
      const [foodLog] = await db
        .insert(foodLogs)
        .values({
          userId,
          jobId,
          mealType,
          totalCalories,
          aiConfidenceScore: job.draftAnalysis
            ? JSON.parse(job.draftAnalysis).aiConfidenceScore
            : 0,
          isVerified: true,
        })
        .returning();

      if (!foodLog) {
        throw new Error('Failed to create food log');
      }

      // Create log items from the confirmed items
      const logItemsData = items.map((item: {
        foodName: string;
        servingGrams: number;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        source: string;
      }) => ({
        logId: foodLog.id,
        foodName: item.foodName,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        source: item.source,
      }));

      await db.insert(logItems).values(logItemsData);

      return NextResponse.json({
        success: true,
        logId: foodLog.id,
        fromDraft: true,
      });
    }

    // Manual entry mode (existing behavior)
    const [foodLog] = await db
      .insert(foodLogs)
      .values({
        userId,
        mealType,
        totalCalories,
        aiConfidenceScore: 1.0, // Manual entry = 100% confidence
        isVerified: true,
      })
      .returning();

    if (!foodLog) {
      throw new Error('Failed to create food log');
    }

    // Create log items
    const logItemsData = items.map((item: {
      foodName: string;
      servingGrams?: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      source: string;
    }) => ({
      logId: foodLog.id,
      foodName: item.foodName,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source: item.source,
    }));

    await db.insert(logItems).values(logItemsData);

    return NextResponse.json({
      success: true,
      logId: foodLog.id,
      fromDraft: false,
    });
  } catch (error) {
    console.error('Food log error:', error);
    return NextResponse.json(
      { error: 'Failed to create food log' },
      { status: 500 }
    );
  }
}
