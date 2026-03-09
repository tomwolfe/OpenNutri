/**
 * Apply Coaching Recommendation API Route
 *
 * Allows users to apply AI coaching recommendations directly to their targets.
 * This enables a closed-loop coaching experience where insights can be acted upon.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userTargets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

interface ApplyRecommendationBody {
  /** Target date (YYYY-MM-DD), defaults to today */
  date?: string;
  /** New calorie target to apply */
  calorieTarget?: number;
  /** New protein target to apply */
  proteinTarget?: number;
  /** New carb target to apply */
  carbTarget?: number;
  /** New fat target to apply */
  fatTarget?: number;
  /** Optional note about why this recommendation was made */
  reason?: string;
}

/**
 * POST /api/targets/apply-recommendation
 * Apply coaching recommendations to user targets
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body: ApplyRecommendationBody = await request.json();

    // Validate that at least one target is provided
    if (
      body.calorieTarget === undefined &&
      body.proteinTarget === undefined &&
      body.carbTarget === undefined &&
      body.fatTarget === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one target value must be provided' },
        { status: 400 }
      );
    }

    // Validate calorie target if provided
    if (body.calorieTarget !== undefined) {
      if (body.calorieTarget < 800 || body.calorieTarget > 5000) {
        return NextResponse.json(
          { error: 'Calorie target must be between 800 and 5000' },
          { status: 400 }
        );
      }
    }

    // Validate protein target if provided
    if (body.proteinTarget !== undefined) {
      if (body.proteinTarget < 20 || body.proteinTarget > 400) {
        return NextResponse.json(
          { error: 'Protein target must be between 20 and 400 grams' },
          { status: 400 }
        );
      }
    }

    // Validate carb target if provided
    if (body.carbTarget !== undefined) {
      if (body.carbTarget < 50 || body.carbTarget > 600) {
        return NextResponse.json(
          { error: 'Carb target must be between 50 and 600 grams' },
          { status: 400 }
        );
      }
    }

    // Validate fat target if provided
    if (body.fatTarget !== undefined) {
      if (body.fatTarget < 20 || body.fatTarget > 250) {
        return NextResponse.json(
          { error: 'Fat target must be between 20 and 250 grams' },
          { status: 400 }
        );
      }
    }

    // Use today's date if not provided
    const targetDate = body.date || new Date().toISOString().split('T')[0];

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(targetDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Get current targets to preserve unset values
    const [currentTarget] = await db
      .select()
      .from(userTargets)
      .where(
        and(
          eq(userTargets.userId, userId),
          eq(userTargets.date, targetDate)
        )
      )
      .limit(1);

    // Build update object with provided values, fallback to current or defaults
    const updateData: {
      userId: string;
      date: string;
      calorieTarget?: number;
      proteinTarget?: number;
      carbTarget?: number;
      fatTarget?: number;
    } = {
      userId,
      date: targetDate,
    };

    if (body.calorieTarget !== undefined) {
      updateData.calorieTarget = body.calorieTarget;
    } else if (currentTarget?.calorieTarget !== null && currentTarget?.calorieTarget !== undefined) {
      updateData.calorieTarget = currentTarget.calorieTarget;
    }

    if (body.proteinTarget !== undefined) {
      updateData.proteinTarget = body.proteinTarget;
    } else if (currentTarget?.proteinTarget !== null && currentTarget?.proteinTarget !== undefined) {
      updateData.proteinTarget = currentTarget.proteinTarget;
    }

    if (body.carbTarget !== undefined) {
      updateData.carbTarget = body.carbTarget;
    } else if (currentTarget?.carbTarget !== null && currentTarget?.carbTarget !== undefined) {
      updateData.carbTarget = currentTarget.carbTarget;
    }

    if (body.fatTarget !== undefined) {
      updateData.fatTarget = body.fatTarget;
    } else if (currentTarget?.fatTarget !== null && currentTarget?.fatTarget !== undefined) {
      updateData.fatTarget = currentTarget.fatTarget;
    }

    // Upsert: insert or update on conflict
    const [target] = await db
      .insert(userTargets)
      .values(updateData)
      .onConflictDoUpdate({
        target: [userTargets.userId, userTargets.date],
        set: {
          calorieTarget: updateData.calorieTarget,
          proteinTarget: updateData.proteinTarget,
          carbTarget: updateData.carbTarget,
          fatTarget: updateData.fatTarget,
        },
      })
      .returning();

    return NextResponse.json({ 
      success: true,
      target,
      message: 'Targets updated successfully'
    });
  } catch (error) {
    console.error('Apply recommendation error:', error);
    return NextResponse.json(
      { error: 'Failed to apply recommendation' },
      { status: 500 }
    );
  }
}
