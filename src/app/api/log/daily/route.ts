/**
 * Get Daily Food Logs API Route
 * GET /api/log/daily?date=2024-03-07
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, logItems } from '@/db/schema';
import { eq, and, gte, lt, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
    // Default to today if no date provided
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(targetDate);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    // Fetch food logs for the day
    const logs = await db
      .select({
        id: foodLogs.id,
        mealType: foodLogs.mealType,
        totalCalories: foodLogs.totalCalories,
        aiConfidenceScore: foodLogs.aiConfidenceScore,
        isVerified: foodLogs.isVerified,
        timestamp: foodLogs.timestamp,
      })
      .from(foodLogs)
      .where(
        and(
          eq(foodLogs.userId, session.user.id),
          gte(foodLogs.timestamp, startDate),
          lt(foodLogs.timestamp, endDate)
        )
      )
      .orderBy(desc(foodLogs.timestamp));

    // Fetch items for each log
    const logsWithItems = await Promise.all(
      logs.map(async (log) => {
        const items = await db
          .select({
            id: logItems.id,
            foodName: logItems.foodName,
            calories: logItems.calories,
            protein: logItems.protein,
            carbs: logItems.carbs,
            fat: logItems.fat,
            source: logItems.source,
          })
          .from(logItems)
          .where(eq(logItems.logId, log.id));

        return { ...log, items };
      })
    );

    // Calculate daily totals
    const dailyTotals = logsWithItems.reduce(
      (totals, log) => ({
        calories: totals.calories + (log.totalCalories || 0),
        protein: totals.protein + (log.items?.reduce((sum, item) => sum + (item.protein || 0), 0) || 0),
        carbs: totals.carbs + (log.items?.reduce((sum, item) => sum + (item.carbs || 0), 0) || 0),
        fat: totals.fat + (log.items?.reduce((sum, item) => sum + (item.fat || 0), 0) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      logs: logsWithItems,
      dailyTotals,
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch food logs' },
      { status: 500 }
    );
  }
}
