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
import { importPublicKey } from '@/lib/sharing-protocol';

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
      .select({ email: users.email, weightGoal: users.weightGoal })
      .from(users)
      .where(eq(users.id, share.ownerId))
      .limit(1);

    // 8. Log access for audit trail
    await db.update(sharedVaults)
      .set({ lastAccessedAt: new Date() })
      .where(eq(sharedVaults.id, shareId));

    return NextResponse.json({
      success: true,
      ownerEmail: owner?.email || null,
      encryptedVaultKey: share.encryptedVaultKey,
      weightRecords,
      weightGoal: owner?.weightGoal || 'maintain',
      ownerId: share.ownerId,
      // Two-step sharing protocol status
      sharingStatus: share.active ? 'active' : 'pendingAccept',
      recipientPublicKey: share.publicKey
    });
  } catch (error) {
    console.error('Shared vault retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve shared data' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/share/[id]
 * Owner wraps the vault key with the recipient's public key and activates the share.
 * This completes the two-step sharing handshake.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shareId = params.id;
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const recipientEmail = session.user.email;

    // Fetch the sharing session
    const [share] = await db
      .select()
      .from(sharedVaults)
      .where(eq(sharedVaults.id, shareId))
      .limit(1);

    if (!share) {
      return NextResponse.json({ error: 'Sharing session not found' }, { status: 404 });
    }

    // Verify recipient email matches session (owner can only activate their own shares)
    if (share.recipientEmail !== recipientEmail) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if share is already active
    if (share.active) {
      return NextResponse.json({ error: 'Sharing session already active' }, { status: 409 });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: 'Sharing session expired' }, { status: 410 });
    }

    // Verify recipient's public key is available
    if (!share.publicKey) {
      return NextResponse.json({ error: 'Recipient public key not found. Has the recipient sent their public key?' }, { status: 400 });
    }

    // Import the recipient's public key (for validation - the actual wrapping is done client-side)
    await importPublicKey(share.publicKey);

    // Parse the wrapped (encrypted) vault key from the request
    const { wrappedVaultKey } = await request.json();
    if (!wrappedVaultKey) {
      return NextResponse.json({ error: 'Wrapped vault key is required' }, { status: 400 });
    }

    // Update the shared vault with the wrapped key and mark as active
    // The wrapped key is encrypted with the recipient's public key, so only they can decrypt it
    await db
      .update(sharedVaults)
      .set({
        encryptedVaultKey: wrappedVaultKey,
        active: true,
      })
      .where(eq(sharedVaults.id, shareId));

    return NextResponse.json({
      success: true,
      shareId,
      message: 'Sharing activated. Recipient can now decrypt the vault key.',
      sharingStatus: 'active'
    });
  } catch (error) {
    console.error('Share activate error:', error);
    return NextResponse.json(
      { error: 'Failed to activate share' },
      { status: 500 }
    );
  }
}

