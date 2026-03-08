/**
 * NextAuth v5 Configuration
 *
 * Uses Credentials provider for email/password authentication
 * with database-backed sessions (NeonDB)
 *
 * NOTE: This is a simplified demo implementation.
 * For production, use bcrypt for password hashing and
 * implement proper signup flow.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
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

        // Find user in database
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          // No user found - for demo, create one automatically
          // In production, require explicit signup with password hashing
          const userId = `user_${crypto.randomUUID().replace(/-/g, '')}`;

          const [newUser] = await db
            .insert(users)
            .values({
              id: userId,
              email,
            })
            .returning();

          if (newUser) {
            return {
              id: newUser.id,
              email: newUser.email,
              name: newUser.email?.split('@')[0],
            };
          }
          return null;
        }

        // For demo: accept any password if user exists
        // In production: verify against stored hash using bcrypt
        return {
          id: user.id,
          email: user.email,
          name: user.email?.split('@')[0],
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
