/**
 * Create Food Log API Route
 * POST /api/log/food
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, logItems } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mealType, items, totalCalories } = body;

    if (!mealType || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Create food log entry
    const [foodLog] = await db
      .insert(foodLogs)
      .values({
        userId: session.user.id,
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
    });
  } catch (error) {
    console.error('Food log error:', error);
    return NextResponse.json(
      { error: 'Failed to create food log' },
      { status: 500 }
    );
  }
}
