/**
 * Data Export API Route
 * GET /api/export?format=json|csv
 *
 * Exports user's complete data for privacy compliance.
 * Includes: food logs, weight records, targets, AI jobs history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, logItems, userTargets, aiJobs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Export all user data as JSON
 */
async function exportAsJSON(userId: string) {
  // Fetch all food logs with items
  const logs = await db
    .select({
      id: foodLogs.id,
      userId: foodLogs.userId,
      jobId: foodLogs.jobId,
      timestamp: foodLogs.timestamp,
      mealType: foodLogs.mealType,
      totalCalories: foodLogs.totalCalories,
      aiConfidenceScore: foodLogs.aiConfidenceScore,
      isVerified: foodLogs.isVerified,
    })
    .from(foodLogs)
    .where(eq(foodLogs.userId, userId))
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

  // Fetch weight records
  const weightRecords = await db
    .select({
      date: userTargets.date,
      weight: userTargets.weightRecord,
      calorieTarget: userTargets.calorieTarget,
      proteinTarget: userTargets.proteinTarget,
      carbTarget: userTargets.carbTarget,
      fatTarget: userTargets.fatTarget,
    })
    .from(userTargets)
    .where(eq(userTargets.userId, userId))
    .orderBy(desc(userTargets.date));

  // Fetch AI jobs history
  const aiJobsHistory = await db
    .select({
      id: aiJobs.id,
      imageUrl: aiJobs.imageUrl,
      status: aiJobs.status,
      createdAt: aiJobs.createdAt,
      completedAt: aiJobs.completedAt,
    })
    .from(aiJobs)
    .where(eq(aiJobs.userId, userId))
    .orderBy(desc(aiJobs.createdAt));

  // Compile complete export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    userId,
    summary: {
      totalLogs: logs.length,
      totalWeightRecords: weightRecords.filter((w) => w.weight !== null).length,
      totalAiScans: aiJobsHistory.length,
      dateRange: {
        earliest: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
        latest: logs.length > 0 ? logs[0].timestamp : null,
      },
    },
    foodLogs: logsWithItems,
    weightRecords,
    aiJobsHistory,
  };

  return exportData;
}

/**
 * Export food logs as CSV
 */
function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','), // Header row
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma or quote
          const escaped = String(value ?? '').replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ];

  return csvRows.join('\n');
}

/**
 * Export as CSV format
 */
async function exportAsCSV(userId: string) {
  // Fetch all food logs with items
  const logs = await db
    .select({
      id: foodLogs.id,
      timestamp: foodLogs.timestamp,
      mealType: foodLogs.mealType,
      totalCalories: foodLogs.totalCalories,
      aiConfidenceScore: foodLogs.aiConfidenceScore,
      isVerified: foodLogs.isVerified,
    })
    .from(foodLogs)
    .where(eq(foodLogs.userId, userId))
    .orderBy(desc(foodLogs.timestamp));

  // Fetch all items
  const allItems: Record<string, unknown>[] = [];

  for (const log of logs) {
    const items = await db
      .select({
        foodName: logItems.foodName,
        calories: logItems.calories,
        protein: logItems.protein,
        carbs: logItems.carbs,
        fat: logItems.fat,
        source: logItems.source,
      })
      .from(logItems)
      .where(eq(logItems.logId, log.id));

    for (const item of items) {
      allItems.push({
        log_id: log.id,
        timestamp: log.timestamp,
        meal_type: log.mealType,
        food_name: item.foodName,
        calories: item.calories,
        protein_g: item.protein,
        carbs_g: item.carbs,
        fat_g: item.fat,
        source: item.source,
        total_calories: log.totalCalories,
        is_verified: log.isVerified,
      });
    }
  }

  return convertToCSV(allItems);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'json';

    if (format === 'json') {
      const exportData = await exportAsJSON(userId);

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="opennutri-export-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    if (format === 'csv') {
      const csvData = await exportAsCSV(userId);

      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="opennutri-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid format. Use "json" or "csv"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
