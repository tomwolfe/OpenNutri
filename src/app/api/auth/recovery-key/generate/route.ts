/**
 * POST /api/auth/recovery-key/generate
 *
 * Generate a sharded recovery kit for the authenticated user.
 * Returns Shamir's Secret Sharing (SSS) shards for vault recovery.
 *
 * Security:
 * - Requires authentication
 * - Shards returned ONCE and never stored on server
 * - User must store shards securely (Local, Cloud, Manual)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateShardedRecoveryKit } from '@/lib/recovery-kit';
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

    // Generate sharded recovery kit (2-of-3 scheme)
    const { shards, salt, encryptedKey, iv } = await generateShardedRecoveryKit(userId, password, 3, 2);

    // Store recovery key metadata in database
    if (existingKey.length > 0) {
      await db
        .update(userKeys)
        .set({
          recoveryKeySalt: salt,
          encryptedRecoveryKey: encryptedKey,
          recoveryKeyIv: iv,
        })
        .where(eq(userKeys.userId, userId));
    } else {
      await db
        .insert(userKeys)
        .values({
          userId,
          salt,
          encryptedVaultKey: encryptedKey,
          encryptionIv: iv,
          recoveryKeySalt: salt,
          encryptedRecoveryKey: encryptedKey,
          recoveryKeyIv: iv,
        });
    }

    // Return shards ONCE - never stored on server
    // Shard 1: Local (Client will store in IndexedDB)
    // Shard 2: Cloud (Client will store in encrypted metadata)
    // Shard 3: Manual (User will store safely)
    return NextResponse.json({
      success: true,
      shards: {
        local: shards[0],
        cloud: shards[1],
        manual: shards[2],
      },
      threshold: 2,
      warning: 'Store these shards securely. Any 2 are required to recover your vault. OpenNutri does not store these shards.',
    });
  } catch (error) {
    console.error('Recovery key generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate recovery shards' },
      { status: 500 }
    );
  }
}
