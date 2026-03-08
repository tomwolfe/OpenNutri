/**
 * Secure Vault Sharing API Route
 * POST /api/share/vault
 *
 * Allows a user to share their vault key (re-encrypted) with a recipient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharedVaults } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { recipientEmail, encryptedVaultKey, publicKey, expiresDays } = await request.json();

    if (!recipientEmail || !encryptedVaultKey || !publicKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const expiresAt = expiresDays 
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) 
      : null;

    const result = await db.insert(sharedVaults).values({
      ownerId: userId,
      recipientEmail,
      encryptedVaultKey,
      publicKey,
      expiresAt,
    }).returning({ id: sharedVaults.id });

    return NextResponse.json({ 
      success: true, 
      shareId: result[0].id,
      shareLink: `${process.env.NEXTAUTH_URL}/share/${result[0].id}`
    });
  } catch (error) {
    console.error('Vault sharing error:', error);
    return NextResponse.json(
      { error: 'Failed to create sharing session' },
      { status: 500 }
    );
  }
}
