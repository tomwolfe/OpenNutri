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
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { 
      id,
      mealType, 
      items, 
      totalCalories, 
      aiConfidenceScore = 0, 
      imageUrl, 
      notes,
      encryptedData,
      encryptionIv,
      encryptionSalt,
      version = 1,
      deviceId
    } = body;

    // Validate request - basic validation, more flexible for encrypted data
    if (!encryptedData && (!mealType || !items || !Array.isArray(items))) {
      return NextResponse.json(
        { error: 'Invalid request body: Missing items or encrypted data' },
        { status: 400 }
      );
    }

    // Create or update food log (Upsert)
    const logData = {
      userId,
      mealType: mealType || 'unknown',
      totalCalories: totalCalories || 0,
      aiConfidenceScore: aiConfidenceScore || 0,
      isVerified: true,
      imageUrl,
      notes,
      encryptedData,
      encryptionIv,
      encryptionSalt,
      version,
      deviceId,
      updatedAt: new Date(),
    };

    let foodLog;
    if (id) {
      // Update existing
      const [updated] = await db
        .update(foodLogs)
        .set(logData)
        .where(eq(foodLogs.id, id))
        .returning();
      foodLog = updated;
    } else {
      // Insert new
      const [inserted] = await db
        .insert(foodLogs)
        .values(logData)
        .returning();
      foodLog = inserted;
    }

    if (!foodLog) {
      throw new Error('Failed to create/update food log');
    }

    // Create log items only if plaintext items are provided
    if (items && Array.isArray(items) && items.length > 0) {
      const logItemsData = items.map((item: {
        foodName: string;
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
        source?: string;
      }) => ({
        logId: foodLog.id,
        foodName: item.foodName,
        calories: item.calories || 0,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fat: item.fat || 0,
        source: item.source || 'MANUAL',
      }));

      await db.insert(logItems).values(logItemsData);
    }

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
