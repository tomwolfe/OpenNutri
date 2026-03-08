/**
 * User Signup API Route
 *
 * Creates a new user account with hashed password.
 * Validates email format and password strength.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const PASSWORD_HASH_SALT_ROUNDS = parseInt(process.env.PASSWORD_HASH_SALT_ROUNDS || '12', 10);
const MIN_PASSWORD_LENGTH = 8;

interface SignupRequest {
  email: string;
  password: string;
}

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
    const body: SignupRequest = await request.json();

    if (!body?.email || !body?.password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { email, password } = body;

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
        { status: 409 }
      );
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_SALT_ROUNDS);
    const userId = `user_${crypto.randomUUID().replace(/-/g, '')}`;

    const [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email,
        passwordHash,
      })
      .returning();

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
