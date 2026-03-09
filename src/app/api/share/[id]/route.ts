/**
 * Shared Vault Retrieval API Route
 * GET /api/share/[id]
 *
 * Security:
 * - Recipient email must match session
 * - Expiration enforced
 * - Rate limiting applied
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharedVaults, userTargets, users } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

// Rate limiting: Track requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, shareId: string): boolean {
  const key = `${ip}:${shareId}`;
  const now = Date.now();
  const hour = 60 * 60 * 1000; // 1 hour in ms
  const maxRequests = 10;

  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + hour });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  rateLimitMap.set(key, record);
  return true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shareId = params.id;

    // 1. Check authentication
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const recipientEmail = session.user.email;

    // 2. Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip, shareId)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // 3. Fetch sharing session
    const [share] = await db
      .select()
      .from(sharedVaults)
      .where(eq(sharedVaults.id, shareId))
      .limit(1);

    if (!share) {
      return NextResponse.json({ error: 'Sharing session not found' }, { status: 404 });
    }

    // 4. Verify recipient email matches session
    if (share.recipientEmail !== recipientEmail) {
      // Log unauthorized access attempt
      console.warn(`Unauthorized access attempt to shared vault ${shareId} by ${recipientEmail}`);
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // 5. Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: 'Sharing session expired' }, { status: 410 });
    }

    // 6. Check if share is active
    if (!share.active) {
      return NextResponse.json({ error: 'Sharing session has been revoked' }, { status: 403 });
    }

    // 7. Fetch owner's weight records and targets (plaintext)
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

    // 8. Log access for audit trail
    await db.update(sharedVaults)
      .set({ lastAccessedAt: new Date() })
      .where(eq(sharedVaults.id, shareId));

    return NextResponse.json({
      success: true,
      ownerEmail: share.recipientEmail,
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

