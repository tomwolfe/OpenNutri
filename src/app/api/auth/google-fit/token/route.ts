import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Google Fit Token Exchange Route
 * 
 * Securely exchanges an authorization code for an access token.
 * Uses the client secret from environment variables to prevent exposure.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, code_verifier } = await request.json();

    if (!code || !code_verifier) {
      return NextResponse.json({ error: 'Missing code or verifier' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_FIT_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;
    const redirectUri = `${new URL(request.url).origin}/auth/google-fit/callback`;

    if (!clientId || !clientSecret) {
      console.error('Google Fit credentials missing in environment');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Google token exchange error:', data);
      return NextResponse.json({ error: data.error_description || 'Token exchange failed' }, { status: response.status });
    }

    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
    });
  } catch (error) {
    console.error('Token exchange route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
