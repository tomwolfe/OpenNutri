/**
 * Ephemeral Session Keys for One-Time Operations
 *
 * This module provides utilities for generating and managing
 * one-time session keys used for ephemeral encryption operations.
 *
 * Use Cases:
 * - One-time image encryption before AI analysis
 * - Temporary session persistence
 * - Ephemeral data sharing
 *
 * Security Properties:
 * - Keys are generated client-side using cryptographically secure random values
 * - Keys are never stored persistently
 * - Keys are transmitted only via secure headers (X-Session-Key)
 * - Server processes and immediately forgets keys after single use
 */

/**
 * Generate a one-time session key for encryption/decryption
 *
 * This key is valid only for a single request and should be
 * transmitted securely (e.g., via custom HTTP headers).
 *
 * @returns Object with base64-encoded key and IV
 */
export function generateSessionKey(): { key: string; iv: string } {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));

  return {
    key: arrayBufferToBase64(keyBytes.buffer),
    iv: arrayBufferToBase64(ivBytes.buffer),
  };
}

/**
 * Helper: Convert ArrayBuffer to base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * ARCHITECTURE DECISION RECORD
 *
 * Problem: True Zero-Knowledge image analysis requires the server to never
 * see plaintext images. But AI analysis requires sending the image to an
 * AI provider (OpenAI, Google, etc.).
 *
 * Option 1: Client encrypts → Server decrypts → AI provider
 * - Pro: Image never stored on our servers
 * - Con: Server briefly sees plaintext in memory
 * - Verdict: ACCEPTABLE - ephemeral memory is not a storage risk
 *
 * Option 2: Client encrypts → Client decrypts → AI provider (direct from client)
 * - Pro: Server never sees anything
 * - Con: Requires exposing AI API keys to client (security risk)
 * - Con: Loses server-side rate limiting and audit logging
 * - Verdict: REJECTED - worse security trade-off
 *
 * Option 3: Client encrypts → Secure Enclave → AI provider
 * - Pro: True isolation, even from server operators
 * - Con: Requires AWS Nitro Enclaves or similar (cost, complexity)
 * - Verdict: FUTURE - implement when scale justifies cost
 *
 * Current: Option 1 with strict ephemeral guarantees
 */
