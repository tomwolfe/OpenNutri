/**
 * User Profile API Route
 *
 * Handles user profile updates and TDEE calculation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, userTargets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { calculateTDEEFromProfile } from '@/lib/tdee';

export const runtime = 'nodejs';

/**
 * GET /api/profile
 * Fetch current user profile
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user profile
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        birthDate: users.birthDate,
        gender: users.gender,
        heightCm: users.heightCm,
        activityLevel: users.activityLevel,
        weightGoal: users.weightGoal,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch latest weight record
    const [latestTarget] = await db
      .select({
        weightRecord: userTargets.weightRecord,
      })
      .from(userTargets)
      .where(eq(userTargets.userId, userId))
      .orderBy(userTargets.date)
      .limit(1);

    // Calculate TDEE if profile is complete
    let tdeeData = null;
    if (latestTarget?.weightRecord) {
      tdeeData = calculateTDEEFromProfile(
        {
          birthDate: user.birthDate,
          gender: user.gender,
          heightCm: user.heightCm,
          activityLevel: user.activityLevel,
        },
        latestTarget.weightRecord
      );
    }

    return NextResponse.json({
      profile: user,
      latestWeight: latestTarget?.weightRecord || null,
      tdee: tdeeData,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profile
 * Update user profile and recalculate TDEE
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();

    const updateData: {
      birthDate?: string | null;
      gender?: string | null;
      heightCm?: number | null;
      activityLevel?: string | null;
    } = {};

    // Validate and set birthDate
    if (body.birthDate !== undefined) {
      if (body.birthDate) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(body.birthDate)) {
          return NextResponse.json(
            { error: 'Invalid date format. Use YYYY-MM-DD' },
            { status: 400 }
          );
        }
        const birthDate = new Date(body.birthDate);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        if (age < 13 || age > 120) {
          return NextResponse.json(
            { error: 'Age must be between 13 and 120' },
            { status: 400 }
          );
        }
        updateData.birthDate = body.birthDate;
      } else {
        updateData.birthDate = null;
      }
    }

    // Validate and set gender
    if (body.gender !== undefined) {
      if (body.gender && !['male', 'female', 'other'].includes(body.gender)) {
        return NextResponse.json(
          { error: 'Gender must be male, female, or other' },
          { status: 400 }
        );
      }
      updateData.gender = body.gender || null;
    }

    // Validate and set height
    if (body.heightCm !== undefined) {
      if (body.heightCm && (typeof body.heightCm !== 'number' || body.heightCm < 50 || body.heightCm > 300)) {
        return NextResponse.json(
          { error: 'Height must be between 50 and 300 cm' },
          { status: 400 }
        );
      }
      updateData.heightCm = body.heightCm || null;
    }

    // Validate and set activity level
    if (body.activityLevel !== undefined) {
      const validLevels = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
      if (body.activityLevel && !validLevels.includes(body.activityLevel)) {
        return NextResponse.json(
          { error: 'Invalid activity level' },
          { status: 400 }
        );
      }
      updateData.activityLevel = body.activityLevel || null;
    }

    // Update user profile
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        birthDate: users.birthDate,
        gender: users.gender,
        heightCm: users.heightCm,
        activityLevel: users.activityLevel,
        weightGoal: users.weightGoal,
      });

    // If we have complete profile data and a weight record, update calorie targets
    const [latestTarget] = await db
      .select({
        weightRecord: userTargets.weightRecord,
      })
      .from(userTargets)
      .where(eq(userTargets.userId, userId))
      .orderBy(userTargets.date)
      .limit(1);

    let tdeeData = null;
    if (
      updatedUser.birthDate &&
      updatedUser.gender &&
      updatedUser.heightCm &&
      updatedUser.activityLevel &&
      latestTarget?.weightRecord
    ) {
      const { calculateTDEEFromProfile } = await import('@/lib/tdee');

      tdeeData = calculateTDEEFromProfile(
        {
          birthDate: updatedUser.birthDate,
          gender: updatedUser.gender,
          heightCm: updatedUser.heightCm,
          activityLevel: updatedUser.activityLevel,
        },
        latestTarget.weightRecord
      );

      // Update today's calorie target based on weight goal
      const today = new Date().toISOString().split('T')[0];
      
      if (tdeeData) {
        const calorieTarget = tdeeData.calorieTargets[updatedUser.weightGoal as 'lose' | 'maintain' | 'gain'] || tdeeData.tdee;

        await db
          .insert(userTargets)
          .values({
            userId,
            date: today,
            calorieTarget,
          })
          .onConflictDoUpdate({
            target: [userTargets.userId, userTargets.date],
            set: { calorieTarget },
          });
      }
    }

    return NextResponse.json({
      profile: updatedUser,
      tdee: tdeeData,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
