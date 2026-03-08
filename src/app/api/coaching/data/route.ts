/**
 * Raw Coaching Data API Route
 * GET /api/coaching/data
 * 
 * Returns weight records and encrypted food logs for client-side analysis.
 * This supports Zero-Knowledge privacy by moving analysis to the client.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userTargets, foodLogs, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 1. Fetch weight records (plaintext is okay)
    const weightRecords = await db
      .select({
        date: userTargets.date,
        weight: userTargets.weightRecord,
      })
      .from(userTargets)
      .where(
        and(
          eq(userTargets.userId, userId),
          gte(userTargets.date, ninetyDaysAgo.toISOString().split('T')[0]),
          lte(userTargets.date, new Date().toISOString().split('T')[0])
        )
      )
      .orderBy(userTargets.date);

    // 2. Fetch food logs (including encryptedData)
    const intakeLogs = await db
      .select({
        id: foodLogs.id,
        timestamp: foodLogs.timestamp,
        totalCalories: foodLogs.totalCalories,
        encryptedData: foodLogs.encryptedData,
        encryptionIv: foodLogs.encryptionIv,
      })
      .from(foodLogs)
      .where(
        and(
          eq(foodLogs.userId, userId),
          gte(foodLogs.timestamp, ninetyDaysAgo)
        )
      )
      .orderBy(desc(foodLogs.timestamp));

    // 3. Get current targets and weight goal
    const today = new Date().toISOString().split('T')[0];
    const [user] = await db
      .select({ weightGoal: users.weightGoal })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [targets] = await db
      .select({
        calorieTarget: userTargets.calorieTarget,
        proteinTarget: userTargets.proteinTarget,
        carbTarget: userTargets.carbTarget,
        fatTarget: userTargets.fatTarget,
      })
      .from(userTargets)
      .where(and(eq(userTargets.userId, userId), eq(userTargets.date, today)))
      .limit(1);

    return NextResponse.json({
      weightRecords,
      intakeLogs,
      targets: {
        calories: targets?.calorieTarget || 2000,
        protein: targets?.proteinTarget || 150,
        carbs: targets?.carbTarget || 250,
        fat: targets?.fatTarget || 65,
        weightGoal: (user?.weightGoal || 'maintain') as 'lose' | 'maintain' | 'gain',
      },
    });
  } catch (error) {
    console.error('Raw coaching data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coaching data' },
      { status: 500 }
    );
  }
}
