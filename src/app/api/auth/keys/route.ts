/**
 * Get User Encryption Keys API Route
 * GET /api/auth/keys
 *
 * Returns key metadata (salt, encrypted key, iv) for the logged-in user.
 * The actual master key is never sent to the server.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [keys] = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, session.user.id))
      .limit(1);

    if (!keys) {
      return NextResponse.json(
        { error: 'Encryption keys not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      salt: keys.salt,
      encryptedVaultKey: keys.encryptedVaultKey,
      encryptionIv: keys.encryptionIv,
    });
  } catch (error) {
    console.error('Fetch keys error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch encryption keys' },
      { status: 500 }
    );
  }
}
