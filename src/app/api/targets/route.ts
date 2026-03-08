/**
 * User Targets API Route
 *
 * Handles weight tracking and nutrition goals.
 * Supports upsert (insert or update) for daily targets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userTargets } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export const runtime = 'edge';

interface TargetBody {
  date?: string;
  weightRecord?: number;
  calorieTarget?: number;
  proteinTarget?: number;
  carbTarget?: number;
  fatTarget?: number;
}

/**
 * GET /api/targets
 * Fetch user targets for a date range or specific date
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const date = searchParams.get('date');

    let targets;

    if (date) {
      // Fetch single date
      const [target] = await db
        .select()
        .from(userTargets)
        .where(and(eq(userTargets.userId, userId), eq(userTargets.date, date)))
        .limit(1);

      targets = target ? [target] : [];
    } else if (startDate && endDate) {
      // Fetch date range
      targets = await db
        .select()
        .from(userTargets)
        .where(
          and(
            eq(userTargets.userId, userId),
            gte(userTargets.date, startDate),
            lte(userTargets.date, endDate)
          )
        )
        .orderBy(desc(userTargets.date));
    } else {
      // Fetch last 30 days by default
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const today = new Date();

      targets = await db
        .select()
        .from(userTargets)
        .where(
          and(
            eq(userTargets.userId, userId),
            gte(userTargets.date, thirtyDaysAgo.toISOString().split('T')[0]),
            lte(userTargets.date, today.toISOString().split('T')[0])
          )
        )
        .orderBy(desc(userTargets.date));
    }

    return NextResponse.json({ targets });
  } catch (error) {
    console.error('Targets fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch targets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/targets
 * Create or update user targets for a specific date
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body: TargetBody = await request.json();

    if (!body.date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Validate weight if provided
    if (body.weightRecord !== undefined) {
      if (typeof body.weightRecord !== 'number' || body.weightRecord <= 0 || body.weightRecord > 500) {
        return NextResponse.json(
          { error: 'Weight must be between 0 and 500' },
          { status: 400 }
        );
      }
    }

    // Upsert: insert or update on conflict
    const [target] = await db
      .insert(userTargets)
      .values({
        userId,
        date: body.date,
        weightRecord: body.weightRecord,
        calorieTarget: body.calorieTarget,
        proteinTarget: body.proteinTarget,
        carbTarget: body.carbTarget,
        fatTarget: body.fatTarget,
      })
      .onConflictDoUpdate({
        target: [userTargets.userId, userTargets.date],
        set: {
          weightRecord: body.weightRecord,
          calorieTarget: body.calorieTarget,
          proteinTarget: body.proteinTarget,
          carbTarget: body.carbTarget,
          fatTarget: body.fatTarget,
        },
      })
      .returning();

    return NextResponse.json({ target });
  } catch (error) {
    console.error('Targets save error:', error);
    return NextResponse.json(
      { error: 'Failed to save targets' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/targets
 * Delete targets for a specific date
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      );
    }

    await db
      .delete(userTargets)
      .where(and(eq(userTargets.userId, userId), eq(userTargets.date, date)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Targets delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete targets' },
      { status: 500 }
    );
  }
}
