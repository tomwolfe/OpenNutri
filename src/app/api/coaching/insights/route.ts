/**
 * Coaching Insights API Route
 * GET /api/coaching/insights
 *
 * Analyzes user's weight and intake data to generate personalized coaching insights.
 * Uses linear regression to detect trends and provide recommendations.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userTargets, foodLogs, logItems, users } from '@/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  generateCoachingInsights,
  type CoachingInsight,
} from '@/lib/coaching';

/**
 * Get historical data for analysis (last 90 days)
 */
async function getHistoricalData(userId: string) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Fetch weight records
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
        lte(
          userTargets.date,
          new Date().toISOString().split('T')[0]
        )
      )
    )
    .orderBy(userTargets.date);

  // Fetch daily intake data
  const intakeData = await db
    .select({
      timestamp: foodLogs.timestamp,
      totalCalories: foodLogs.totalCalories,
    })
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        gte(foodLogs.timestamp, ninetyDaysAgo)
      )
    )
    .orderBy(foodLogs.timestamp);

  // Fetch detailed macronutrient data
  const macroData = await db
    .select({
      timestamp: foodLogs.timestamp,
      protein: sql<number>`COALESCE(SUM(${logItems.protein}), 0)`,
      carbs: sql<number>`COALESCE(SUM(${logItems.carbs}), 0)`,
      fat: sql<number>`COALESCE(SUM(${logItems.fat}), 0)`,
    })
    .from(foodLogs)
    .leftJoin(logItems, eq(logItems.logId, foodLogs.id))
    .where(
      and(
        eq(foodLogs.userId, userId),
        gte(foodLogs.timestamp, ninetyDaysAgo)
      )
    )
    .groupBy(foodLogs.timestamp, foodLogs.id)
    .orderBy(foodLogs.timestamp);

  return { weightRecords, intakeData, macroData };
}

/**
 * Get current targets
 */
async function getCurrentTargets(userId: string) {
  const today = new Date().toISOString().split('T')[0];

  // Fetch user's weight goal from users table
  const [user] = await db
    .select({
      weightGoal: users.weightGoal,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Fetch today's targets
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

  // Default targets if none set
  return {
    calories: targets?.calorieTarget || 2000,
    protein: targets?.proteinTarget || 150,
    carbs: targets?.carbTarget || 250,
    fat: targets?.fatTarget || 65,
    weightGoal: (user?.weightGoal || 'maintain') as 'lose' | 'maintain' | 'gain',
  };
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get historical data
    const { weightRecords, intakeData, macroData } =
      await getHistoricalData(userId);

    // Get current targets
    const targets = await getCurrentTargets(userId);

    // Convert weight records to format for analysis
    const weightData = weightRecords
      .filter((r) => r.weight !== null)
      .map((r) => ({
        timestamp: new Date(r.date).getTime(),
        weight: r.weight!,
      }));

    // Aggregate intake data by day with macros
    const intakeByDay = new Map<
      string,
      { calories: number; protein: number; carbs: number; fat: number }
    >();

    for (const record of intakeData) {
      const dateKey = new Date(record.timestamp!).toISOString().split('T')[0];
      const existing = intakeByDay.get(dateKey) || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };

      existing.calories += record.totalCalories || 0;
      intakeByDay.set(dateKey, existing);
    }

    // Merge macro data
    for (const record of macroData) {
      const dateKey = new Date(record.timestamp!).toISOString().split('T')[0];
      const existing = intakeByDay.get(dateKey) || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };

      existing.protein += Number(record.protein) || 0;
      existing.carbs += Number(record.carbs) || 0;
      existing.fat += Number(record.fat) || 0;
      intakeByDay.set(dateKey, existing);
    }

    // Convert to array for analysis
    const intakeDataPoints = Array.from(intakeByDay.entries()).map(
      ([date, data]) => ({
        timestamp: new Date(date).getTime(),
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
      })
    );

    // Generate insights
    const insights: CoachingInsight[] = generateCoachingInsights(
      weightData,
      intakeDataPoints,
      targets
    );

    // Calculate trend summary
    const trendSummary = {
      dataQuality: {
        weightEntries: weightData.length,
        loggingDays: intakeDataPoints.length,
        hasEnoughData: weightData.length >= 3 && intakeDataPoints.length >= 3,
      },
      currentStatus: {
        avgCalories:
          intakeDataPoints.reduce((sum, d) => sum + d.calories, 0) /
          Math.max(1, intakeDataPoints.length),
        avgProtein:
          intakeDataPoints.reduce((sum, d) => sum + d.protein, 0) /
          Math.max(1, intakeDataPoints.length),
        currentWeight: weightData.length > 0 ? weightData[weightData.length - 1].weight : null,
      },
    };

    return NextResponse.json({
      insights,
      trendSummary,
      targets,
    });
  } catch (error) {
    console.error('Coaching insights error:', error);
    return NextResponse.json(
      { error: 'Failed to generate coaching insights' },
      { status: 500 }
    );
  }
}
