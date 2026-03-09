/**
 * Household Sharing Management API
 * 
 * GET /api/share/household - List all household members
 * POST /api/share/household - Invite a new member
 * DELETE /api/share/household/:id - Remove a member
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharedVaults, users } from '@/db/schema';
import { eq, or, and, gt } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * GET /api/share/household
 * List all household members (both as owner and recipient)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();

    // Get shares where user is owner (people they've shared with)
    const asOwner = await db
      .select({
        id: sharedVaults.id,
        type: sharedVaults.recipientEmail,
        email: sharedVaults.recipientEmail,
        role: sharedVaults.ownerId,
        createdAt: sharedVaults.createdAt,
        expiresAt: sharedVaults.expiresAt,
        active: sharedVaults.active,
      })
      .from(sharedVaults)
      .where(
        and(
          eq(sharedVaults.ownerId, userId),
          eq(sharedVaults.active, true),
          gt(sharedVaults.expiresAt, now)
        )
      );

    // Get shares where user is recipient (people who shared with them)
    const asRecipient = await db
      .select({
        id: sharedVaults.id,
        type: users.email,
        email: users.email,
        role: sharedVaults.ownerId,
        createdAt: sharedVaults.createdAt,
        expiresAt: sharedVaults.expiresAt,
        active: sharedVaults.active,
      })
      .from(sharedVaults)
      .innerJoin(users, eq(sharedVaults.ownerId, users.id))
      .where(
        and(
          eq(sharedVaults.recipientEmail, session.user.email),
          eq(sharedVaults.active, true),
          gt(sharedVaults.expiresAt, now)
        )
      );

    // Combine and format
    const householdMembers = [
      ...asOwner.map(s => ({
        id: s.id,
        email: s.email,
        role: 'owner' as const,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        active: s.active,
      })),
      ...asRecipient.map(s => ({
        id: s.id,
        email: s.email,
        role: 'recipient' as const,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        active: s.active,
      })),
    ];

    return NextResponse.json({ householdMembers });
  } catch (error) {
    console.error('Household list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch household members' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/share/household
 * Invite a new household member
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { recipientEmail, encryptedVaultKey, publicKey, expiresDays = 30 } = await request.json();

    // Validate required fields
    if (!recipientEmail || !encryptedVaultKey || !publicKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Email validation
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(recipientEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Prevent sharing to self
    if (recipientEmail === session.user.email) {
      return NextResponse.json(
        { error: 'Cannot share with yourself' },
        { status: 400 }
      );
    }

    // Check if already shared
    const existing = await db
      .select()
      .from(sharedVaults)
      .where(
        and(
          eq(sharedVaults.ownerId, userId),
          eq(sharedVaults.recipientEmail, recipientEmail),
          eq(sharedVaults.active, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Already shared with this email' },
        { status: 409 }
      );
    }

    // Calculate expiration
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    // Create share record
    const { nanoid } = await import('nanoid');
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

    const shareLink = `${process.env.NEXTAUTH_URL || ''}/share/${shareId}`;

    return NextResponse.json({
      success: true,
      shareId,
      shareLink,
      expiresAt: expiresAt.toISOString(),
      message: `Invitation sent to ${recipientEmail}`
    });
  } catch (error) {
    console.error('Household invite error:', error);
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/share/household/:id
 * Remove a household member or revoke access
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('id');

    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID required' },
        { status: 400 }
      );
    }

    // Delete if user is owner or recipient
    await db
      .delete(sharedVaults)
      .where(
        and(
          eq(sharedVaults.id, shareId),
          or(
            eq(sharedVaults.ownerId, userId),
            eq(sharedVaults.recipientEmail, session.user.email)
          )
        )
      );

    return NextResponse.json({ success: true, message: 'Access revoked' });
  } catch (error) {
    console.error('Household remove error:', error);
    return NextResponse.json(
      { error: 'Failed to remove household member' },
      { status: 500 }
    );
  }
}
