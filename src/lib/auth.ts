/**
 * NextAuth v5 Configuration
 *
 * Uses Credentials provider for email/password authentication
 * with database-backed sessions (NeonDB)
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Find user in database
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.passwordHash) {
          return null;
        }

        // Verify password against stored hash (Argon2id)
        let isValid = false;
        try {
          // If the hash starts with $argon2, it's an argon2 hash
          if (user.passwordHash.startsWith('$argon2')) {
            isValid = await verify(user.passwordHash, password);
          } else {
            // Legacy check (optional, but good for migration)
            // If the hash is SHA-256 + bcrypt as it was before, 
            // the capture of that SHA-256 hash would work.
            // For a clean break per roadmap, we could just reject.
            return null; 
          }
        } catch (err) {
          console.error('Password verification failed:', err);
          return null;
        }

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.email?.split('@')[0],
        };
      },
    }),
  ],
});
