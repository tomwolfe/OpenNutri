/**
 * POST /api/auth/recovery-key/recover
 *
 * Recover vault access using BIP-39 mnemonics.
 * This allows users to set a new password if they forgot the old one.
 *
 * Security:
 * - Does NOT require authentication (user is locked out)
 * - Requires valid mnemonics
 * - Updates encryption key data with new password
 * - All existing data remains encrypted with same master key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { unlockVaultWithMnemonic, validateMnemonic } from '@/lib/recovery-kit';
import { z } from 'zod';

const requestSchema = z.object({
  userId: z.string(),
  mnemonics: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { userId, mnemonics, newPassword } = validation.data;

    // Validate mnemonics format
    if (!validateMnemonic(mnemonics)) {
      return NextResponse.json(
        { error: 'Invalid mnemonic phrase. Please check your recovery words.' },
        { status: 400 }
      );
    }

    // Get existing key data
    const existingKeys = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));

    if (existingKeys.length === 0) {
      return NextResponse.json(
        { error: 'No encryption keys found for this user.' },
        { status: 404 }
      );
    }

    const existingKey = existingKeys[0];

    // Check if recovery key is set up
    if (!existingKey.recoveryKeySalt) {
      return NextResponse.json(
        { error: 'Recovery key was not set up for this account.' },
        { status: 400 }
      );
    }

    // Unlock vault using mnemonics and get new key data
    const recovery = await unlockVaultWithMnemonic(mnemonics, newPassword);

    // Update the database with new encryption parameters
    await db
      .update(userKeys)
      .set({
        salt: recovery.salt,
        encryptedVaultKey: recovery.encryptedKey,
        encryptionIv: recovery.iv,
        // Also update recovery key with new password
        recoveryKeySalt: recovery.salt,
        encryptedRecoveryKey: recovery.encryptedKey,
        recoveryKeyIv: recovery.iv,
      })
      .where(eq(userKeys.userId, userId));

    return NextResponse.json({
      success: true,
      message: 'Vault recovered successfully. You can now log in with your new password.',
      userId,
    });
  } catch (error) {
    console.error('Vault recovery failed:', error);
    return NextResponse.json(
      { error: 'Failed to recover vault. Please check your mnemonics and try again.' },
      { status: 500 }
    );
  }
}
