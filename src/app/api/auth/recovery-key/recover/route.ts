/**
 * POST /api/auth/recovery-key/recover
 *
 * Recover vault access using BIP-39 mnemonics or SSS shards.
 * This allows users to set a new password if they forgot the old one.
 *
 * Security:
 * - Does NOT require authentication (user is locked out)
 * - Requires valid mnemonics or threshold of shards
 * - Updates encryption key data with new password
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { unlockVaultWithMnemonic, validateMnemonic } from '@/lib/recovery-kit';
import { combineShards, isValidShard } from '@/lib/sss';
import { z } from 'zod';

const requestSchema = z.object({
  userId: z.string(),
  mnemonics: z.string().optional(),
  shards: z.array(z.string()).optional(),
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

    const { userId, mnemonics, shards, newPassword } = validation.data;

    let recoveryMnemonic = mnemonics;

    // 1. Reconstruct mnemonic if shards are provided
    if (shards && shards.length >= 2) {
      try {
        // Validate shards first
        const validShards = shards.filter(isValidShard);
        if (validShards.length < 2) {
          return NextResponse.json({ error: 'At least 2 valid shards are required' }, { status: 400 });
        }
        recoveryMnemonic = combineShards(validShards);
      } catch (err) {
        return NextResponse.json({ error: 'Failed to reconstruct recovery key from shards' }, { status: 400 });
      }
    }

    if (!recoveryMnemonic) {
      return NextResponse.json({ error: 'Mnemonic or shards are required' }, { status: 400 });
    }

    // 2. Validate mnemonics format
    if (!validateMnemonic(recoveryMnemonic)) {
      return NextResponse.json(
        { error: 'Invalid recovery key. Please check your words or shards.' },
        { status: 400 }
      );
    }

    // 3. Get existing key data
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

    // 4. Unlock vault using reconstructed mnemonic
    const recovery = await unlockVaultWithMnemonic(recoveryMnemonic, newPassword);

    // 5. Update the database with new encryption parameters
    await db
      .update(userKeys)
      .set({
        salt: recovery.salt,
        encryptedVaultKey: recovery.encryptedKey,
        encryptionIv: recovery.iv,
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
      { error: 'Failed to recover vault. Please check your credentials and try again.' },
      { status: 500 }
    );
  }
}
