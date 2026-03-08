/**
 * Create Food Log API Route
 * POST /api/log/food
 *
 * Creates verified food log entries from AI analysis or manual entry.
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

    const userId = session.user.id;
    const body = await request.json();
    const { 
      mealType, 
      items, 
      totalCalories, 
      aiConfidenceScore = 0, 
      imageUrl, 
      notes,
      encryptedData,
      encryptionIv,
      encryptionSalt
    } = body;

    // Validate request
    if (!mealType || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Create verified food log
    const [foodLog] = await db
      .insert(foodLogs)
      .values({
        userId,
        mealType,
        totalCalories,
        aiConfidenceScore,
        isVerified: true,
        imageUrl,
        notes,
        encryptedData,
        encryptionIv,
        encryptionSalt,
      })
      .returning();

    if (!foodLog) {
      throw new Error('Failed to create food log');
    }

    // Create log items
    const logItemsData = items.map((item: {
      foodName: string;
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
