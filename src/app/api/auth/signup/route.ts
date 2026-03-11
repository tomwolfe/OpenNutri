/**
 * User Signup API Route
 *
 * Creates a new user account with hashed password.
 * Validates email format and password strength.
 *
 * SECURITY: Passwords are hashed server-side using Argon2id.
 * For enhanced security, consider implementing client-side password hashing
 * to prevent plaintext password transmission over TLS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';

export const runtime = 'nodejs'; // Argon2 needs Node.js, not Edge

const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
  }
  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body?.email || !body?.password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { email, password, keyMetadata } = body;

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password and create user
    const passwordHash = await hash(password);
    const userId = `user_${crypto.randomUUID().replace(/-/g, '')}`;

    // Create user and their encryption key record in a transaction
    const newUser = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          id: userId,
          email,
          passwordHash,
        })
        .returning();

      if (keyMetadata) {
        await tx.insert(userKeys).values({
          userId: user.id,
          salt: keyMetadata.salt,
          encryptedVaultKey: keyMetadata.encryptedKey,
          encryptionIv: keyMetadata.iv,
        });
      }

      return user;
    });

    if (!newUser) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Return user data without password hash
    return NextResponse.json(
      {
        user: {
          id: newUser.id,
          email: newUser.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
