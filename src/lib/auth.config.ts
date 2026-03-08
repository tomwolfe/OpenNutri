/**
 * NextAuth v5 Configuration (Edge-compatible)
 *
 * This config is split from auth.ts to avoid importing bcryptjs
 * into Edge middleware. bcryptjs relies on Node.js APIs that
 * are not available in the Edge runtime.
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [], // Leave empty here - providers defined in auth.ts
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
