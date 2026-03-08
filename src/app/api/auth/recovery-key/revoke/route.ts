/**
 * POST /api/auth/recovery-key/revoke
 *
 * Revoke (delete) the recovery key for the authenticated user.
 * This makes the existing mnemonics invalid.
 *
 * Security:
 * - Requires authentication
 * - Requires password verification
 * - Old mnemonics will no longer work after revocation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(_request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Clear recovery key fields
    await db
      .update(userKeys)
      .set({
        recoveryKeySalt: null,
        encryptedRecoveryKey: null,
        recoveryKeyIv: null,
      })
      .where(eq(userKeys.userId, userId));

    return NextResponse.json({
      success: true,
      message: 'Recovery key revoked successfully. Old mnemonics are now invalid.',
    });
  } catch (error) {
    console.error('Recovery key revocation failed:', error);
    return NextResponse.json(
      { error: 'Failed to revoke recovery key' },
      { status: 500 }
    );
  }
}
