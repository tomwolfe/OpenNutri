/**
 * Shared Vault Retrieval API Route
 * GET /api/share/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedVaults, userTargets, users } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shareId = params.id;

    // 1. Fetch sharing session
    const [share] = await db
      .select()
      .from(sharedVaults)
      .where(eq(sharedVaults.id, shareId))
      .limit(1);

    if (!share) {
      return NextResponse.json({ error: 'Sharing session not found' }, { status: 404 });
    }

    // 2. Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: 'Sharing session expired' }, { status: 410 });
    }

    // 3. Fetch owner's weight records and targets (plaintext)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const weightRecords = await db
      .select({
        date: userTargets.date,
        weight: userTargets.weightRecord,
      })
      .from(userTargets)
      .where(
        and(
          eq(userTargets.userId, share.ownerId),
          gte(userTargets.date, ninetyDaysAgo.toISOString().split('T')[0]),
          lte(userTargets.date, new Date().toISOString().split('T')[0])
        )
      )
      .orderBy(userTargets.date);

    const [owner] = await db
      .select({ weightGoal: users.weightGoal })
      .from(users)
      .where(eq(users.id, share.ownerId))
      .limit(1);

    return NextResponse.json({
      success: true,
      ownerEmail: share.recipientEmail, // For the recipient to verify
      encryptedVaultKey: share.encryptedVaultKey,
      weightRecords,
      weightGoal: owner?.weightGoal || 'maintain',
      ownerId: share.ownerId
    });
  } catch (error) {
    console.error('Shared vault retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve shared data' },
      { status: 500 }
    );
  }
}
