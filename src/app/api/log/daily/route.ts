/**
 * Get Daily Food Logs API Route
 * GET /api/log/daily?date=2024-03-07
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs } from '@/db/schema';
import { eq, and, gte, lt, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    const sinceParam = searchParams.get('since');

    // Default to today if no date provided
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const startDate = new Date(targetDate);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    // Build filters
    const filters = [
      eq(foodLogs.userId, session.user.id),
      gte(foodLogs.timestamp, startDate),
      lt(foodLogs.timestamp, endDate),
    ];

    if (sinceParam) {
      filters.push(gte(foodLogs.updatedAt, new Date(parseInt(sinceParam))));
    }

    // Fetch food logs with items in a single query using Drizzle Relational API
    const logsWithItems = await db.query.foodLogs.findMany({
      where: and(...filters),
      with: {
        logItems: true,
      },
      columns: {
        id: true,
        userId: true,
        mealType: true,
        totalCalories: true,
        aiConfidenceScore: true,
        isVerified: true,
        timestamp: true,
        imageUrl: true,
        notes: true,
        encryptedData: true,
        encryptionIv: true,
        encryptionSalt: true,
        updatedAt: true,
      },
      orderBy: [desc(foodLogs.timestamp)],
    });

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      logs: logsWithItems,
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch food logs' },
      { status: 500 }
    );
  }
}
