/**
 * Delta Sync API Route
 * GET /api/sync/delta?since=TIMESTAMP
 *
 * Returns all changes (food logs and targets) since the given timestamp.
 * This enables efficient multi-device sync without needing to query by date.
 *
 * Query Parameters:
 * - since: Unix timestamp (ms) of last sync (required)
 * - include: Comma-separated list of entity types to include (default: 'logs,targets')
 *
 * Response:
 * - logs: Array of food logs modified since timestamp
 * - targets: Array of user targets modified since timestamp
 * - serverTime: Current server timestamp for client to update lastSyncedAt
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, userTargets, userRecipes } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sinceParam = searchParams.get('since');
    const includeParam = searchParams.get('include') || 'logs,targets,recipes';

    if (!sinceParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: since (Unix timestamp in ms)' },
        { status: 400 }
      );
    }

    const sinceTimestamp = new Date(parseInt(sinceParam));
    const includeTypes = includeParam.split(',').map(s => s.trim());

    const results: {
      logs?: unknown[];
      targets?: (typeof userTargets.$inferSelect)[];
      recipes?: (typeof userRecipes.$inferSelect)[];
      serverTime: number;
    } = {
      serverTime: Date.now(),
    };

    // Fetch food logs... (existing logic)

    // Fetch user recipes modified since timestamp
    if (includeTypes.includes('recipes')) {
      const recipes = await db.query.userRecipes.findMany({
        where: and(
          eq(userRecipes.userId, session.user.id),
          gt(userRecipes.updatedAt, sinceTimestamp)
        ),
        columns: {
          id: true,
          userId: true,
          name: true,
          description: true,
          encryptedData: true,
          encryptionIv: true,
          version: true,
          updatedAt: true,
        },
      });

      results.recipes = recipes;
    }

    // Fetch user targets... (existing logic)


    return NextResponse.json(results);
  } catch (error) {
    console.error('Delta sync error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delta changes' },
      { status: 500 }
    );
  }
}
