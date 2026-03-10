'use client';

import { useEffect } from 'react';

/**
 * Google Fit OAuth Callback Page
 * 
 * Extracts the authorization code from the URL and sends it back to the opener
 * window via postMessage. This allows the main application to handle the 
 * token exchange securely.
 */
export default function GoogleFitCallback() {
  useEffect(() => {
    // Get code or error from URL
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (window.opener) {
      if (code) {
        // Send code back to the opener
        window.opener.postMessage({
          type: 'GOOGLE_FIT_OAUTH_CODE',
          payload: { code }
        }, window.location.origin);
      } else if (error) {
        // Send error back to the opener
        window.opener.postMessage({
          type: 'GOOGLE_FIT_OAUTH_ERROR',
          error
        }, window.location.origin);
      } else {
        // No code or error found
        window.opener.postMessage({
          type: 'GOOGLE_FIT_OAUTH_ERROR',
          error: 'No authorization code found in response'
        }, window.location.origin);
      }
    } else {
      console.error('No opener window found for Google Fit callback');
    }

    // Note: The opener window will handle closing this popup
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <h1 className="text-xl font-semibold mb-2">Connecting to Google Fit...</h1>
      <p className="text-muted-foreground">You can close this window if it doesn't close automatically.</p>
    </div>
  );
}