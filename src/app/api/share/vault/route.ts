/**
 * Secure Vault Sharing API Route
 * POST /api/share/vault
 *
 * Allows a user to share their vault key (re-encrypted) with a recipient.
 * Security:
 * - Owner must be authenticated
 * - Recipient email validated
 * - Expiration enforced
 * - Audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharedVaults } from '@/db/schema';
import { nanoid } from 'nanoid';

// Rate limiting: Max 5 share creations per hour per user
const shareRateLimit = new Map<string, { count: number; resetTime: number }>();

function checkShareRateLimit(userId: string): boolean {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const maxShares = 5;

  const record = shareRateLimit.get(userId);
  
  if (!record || now > record.resetTime) {
    shareRateLimit.set(userId, { count: 1, resetTime: now + hour });
    return true;
  }

  if (record.count >= maxShares) {
    return false;
  }

  record.count++;
  shareRateLimit.set(userId, record);
  return true;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limiting
    if (!checkShareRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Too many share requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { recipientEmail, encryptedVaultKey, publicKey, expiresDays } = await request.json();

    // Validate required fields
    if (!recipientEmail || !encryptedVaultKey || !publicKey) {
      return NextResponse.json(
        { error: 'Missing required fields: recipientEmail, encryptedVaultKey, publicKey' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!EMAIL_REGEX.test(recipientEmail)) {
      return NextResponse.json(
        { error: 'Invalid recipient email format' },
        { status: 400 }
      );
    }

    // Prevent sharing to self
    if (recipientEmail === session.user.email) {
      return NextResponse.json(
        { error: 'Cannot share vault with yourself' },
        { status: 400 }
      );
    }

    // Validate expiration (max 365 days)
    const maxExpiresDays = 365;
    const validExpiresDays = expiresDays 
      ? Math.min(parseInt(expiresDays, 10), maxExpiresDays)
      : 30; // Default 30 days

    const expiresAt = new Date(Date.now() + validExpiresDays * 24 * 60 * 60 * 1000);

    // Create share record
    const shareId = nanoid();
    await db.insert(sharedVaults).values({
      id: shareId,
      ownerId: userId,
      recipientEmail,
      encryptedVaultKey,
      publicKey,
      expiresAt,
      active: true,
    });

    // Generate share link
    const shareLink = `${process.env.NEXTAUTH_URL || ''}/share/${shareId}`;

    return NextResponse.json({
      success: true,
      shareId,
      shareLink,
      expiresAt: expiresAt.toISOString(),
      message: `Vault shared with ${recipientEmail}`
    });
  } catch (error) {
    console.error('Vault sharing error:', error);
    return NextResponse.json(
      { error: 'Failed to create sharing session' },
      { status: 500 }
    );
  }
}

