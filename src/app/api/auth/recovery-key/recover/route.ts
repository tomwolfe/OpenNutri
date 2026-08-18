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

export const dynamic = 'force-dynamic';

/**
 * Rate limiting for recovery attempts
 * Per-IP: max 5 attempts per 15 minutes
 * Per-userId: max 5 attempts per 15 minutes
 * Uses exponential backoff: 1min, 2min, 4min, 8min, 16min
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number; backoffMinutes: number }>();

function getRateLimitKey(ip: string, userId: string): string {
  return `${ip}:${userId}`;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs, backoffMinutes: 1 });
    return { allowed: true };
  }

  if (record.count >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  record.count++;
  rateLimitStore.set(key, record);
  return { allowed: true };
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // First failure or window expired: start with 1 minute backoff
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs, backoffMinutes: 1 });
  } else {
    // Exponential backoff: double the backoff window on each failure
    const newBackoffMinutes = Math.min(record.backoffMinutes * 2, 16);
    rateLimitStore.set(key, {
      count: record.count + 1,
      resetTime: now + newBackoffMinutes * 60 * 1000,
      backoffMinutes: newBackoffMinutes,
    });
  }
}

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

    // Rate limiting: per IP + per userId
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = getRateLimitKey(ip, userId);
    const { allowed, retryAfterSeconds } = checkRateLimit(rateLimitKey);

    if (!allowed) {
      return NextResponse.json(
        { error: `Too many recovery attempts. Please try again in ${retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    let recoveryMnemonic = mnemonics;

    // 1. Reconstruct mnemonic if shards are provided
    if (shards && shards.length >= 2) {
      try {
        // Validate shards first
        const validShards = shards.filter(isValidShard);
        if (validShards.length < 2) {
          recordFailedAttempt(rateLimitKey);
          return NextResponse.json({ error: 'At least 2 valid shards are required' }, { status: 400 });
        }
        recoveryMnemonic = combineShards(validShards);
      } catch (_err) {
        recordFailedAttempt(rateLimitKey);
        return NextResponse.json({ error: 'Failed to reconstruct recovery key from shards' }, { status: 400 });
      }
    }

    if (!recoveryMnemonic) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json({ error: 'Mnemonic or shards are required' }, { status: 400 });
    }

    // 2. Validate mnemonics format
    if (!validateMnemonic(recoveryMnemonic)) {
      recordFailedAttempt(rateLimitKey);
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
      recordFailedAttempt(rateLimitKey);
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
    // Record failure for rate limiting (don't reveal which step failed)
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const body = await request.clone().json().catch(() => ({}));
    if (body.userId) {
      recordFailedAttempt(getRateLimitKey(ip, body.userId));
    }
    return NextResponse.json(
      { error: 'Failed to recover vault. Please check your credentials and try again.' },
      { status: 500 }
    );
  }
}
