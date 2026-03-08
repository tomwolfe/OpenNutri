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
import bcrypt from 'bcryptjs';
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
        const password = credentials.password as string;

        // Find user in database
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          // No user found - require explicit signup
          return null;
        }

        // Verify password against stored hash
        if (!user.passwordHash) {
          // User exists but has no password hash (legacy auto-created user)
          // Reject login - they need to sign up properly
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
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
