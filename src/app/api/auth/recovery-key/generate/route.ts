/**
 * POST /api/auth/recovery-key/generate
 *
 * Generate a recovery key for the authenticated user.
 * Returns BIP-39 style mnemonics that can be used to recover the vault.
 *
 * Security:
 * - Requires authentication
 * - Mnemonics returned ONCE and never stored on server
 * - User must store mnemonics securely (paper, password manager, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateRecoveryKit } from '@/lib/recovery-kit';
import { z } from 'zod';

const requestSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
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

    // Parse and validate request
    const body = await request.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { password } = validation.data;

    // Check if user already has a recovery key
    const existingKey = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));

    if (existingKey.length > 0 && existingKey[0].recoveryKeySalt) {
      // Recovery key already exists - user must revoke first
      return NextResponse.json(
        { 
          error: 'Recovery key already exists. Revoke existing key before generating a new one.',
          exists: true 
        },
        { status: 409 }
      );
    }

    // Generate recovery kit
    const recoveryKit = await generateRecoveryKit(userId, password);

    // Store recovery key data in database
    if (existingKey.length > 0) {
      // Update existing key record
      await db
        .update(userKeys)
        .set({
          recoveryKeySalt: recoveryKit.salt,
          encryptedRecoveryKey: recoveryKit.encryptedKey,
          recoveryKeyIv: recoveryKit.iv,
        })
        .where(eq(userKeys.userId, userId));
    } else {
      // Create new key record
      await db
        .insert(userKeys)
        .values({
          userId,
          salt: recoveryKit.salt,
          encryptedVaultKey: recoveryKit.encryptedKey,
          encryptionIv: recoveryKit.iv,
          recoveryKeySalt: recoveryKit.salt,
          encryptedRecoveryKey: recoveryKit.encryptedKey,
          recoveryKeyIv: recoveryKit.iv,
        });
    }

    // Return mnemonics ONCE - never stored on server
    return NextResponse.json({
      success: true,
      mnemonics: recoveryKit.mnemonics,
      warning: 'Store these mnemonics securely. They will NEVER be shown again. If you lose them, your data cannot be recovered.',
    });
  } catch (error) {
    console.error('Recovery key generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate recovery key' },
      { status: 500 }
    );
  }
}
