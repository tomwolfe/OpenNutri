/**
 * Auth Middleware
 * Protects routes and redirects unauthenticated users
 */

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/dashboard/:path*', '/log/:path*'],
};
