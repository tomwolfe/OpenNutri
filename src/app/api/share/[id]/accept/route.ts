/**
 * Shared Vault Accept API Route
 * POST /api/share/[id]/accept
 * 
 * Recipient sends their public key to initiate the sharing handshake.
 * Owner will later wrap the vault key with this public key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharedVaults } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { importPublicKey } from '@/lib/sharing-protocol';

export async function POST(
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

    // Verify recipient email matches session
    if (share.recipientEmail !== recipientEmail) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if share is already active (already completed)
    if (share.active) {
      return NextResponse.json({ error: 'Sharing session already active' }, { status: 409 });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: 'Sharing session expired' }, { status: 410 });
    }

    // Parse the recipient's public key
    const { publicKey } = await request.json();
    if (!publicKey) {
      return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
    }

    // Import the public key and store it in the shared vault
    await importPublicKey(publicKey);

    // Update the shared vault with the recipient's public key
    // Mark as pending - owner will wrap the vault key next
    await db
      .update(sharedVaults)
      .set({
        publicKey: publicKey,
      })
      .where(eq(sharedVaults.id, shareId));

    return NextResponse.json({
      success: true,
      shareId,
      status: 'pending',
      message: 'Public key accepted. Owner will now wrap the vault key.'
    });
  } catch (error) {
    console.error('Share accept error:', error);
    return NextResponse.json(
      { error: 'Failed to accept share' },
      { status: 500 }
    );
  }
}