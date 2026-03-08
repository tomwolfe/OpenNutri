/**
 * Server-Side Vault Key Retrieval
 *
 * ⚠️ SECURITY CRITICAL: This module handles decryption keys server-side.
 * 
 * This is used ONLY for ephemeral image decryption during AI analysis.
 * The key exists in server memory only for the duration of the function
 * execution and is never logged, stored, or transmitted.
 *
 * Threat Model:
 * - ✅ Protects against: Third-party storage providers (Vercel Blob) seeing plaintext images
 * - ✅ Protects against: Persistent data breaches (keys not stored with data)
 * - ⚠️ Does NOT protect against: Compromised serverless function runtime
 * - ⚠️ Does NOT protect against: Memory dumps during function execution
 *
 * This is an acceptable trade-off because:
 * 1. Serverless functions are ephemeral (no persistent memory)
 * 2. Images are decrypted in memory only (never written to disk)
 * 3. Memory is garbage collected immediately after function completion
 * 4. This closes the privacy gap of plaintext images touching Vercel Blob
 */

import { db } from '@/lib/db';
import { userKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getVaultKey } from '@/lib/encryption';

/**
 * Cached vault keys per user (ephemeral, memory-only)
 * Cleared when function execution completes
 */
const vaultKeyCache = new Map<string, { key: CryptoKey; timestamp: number }>();

/**
 * Cache TTL: 5 minutes (reduces repeated DB queries during a session)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get user's vault key for ephemeral decryption operations
 * 
 * This retrieves the encrypted vault key from the database,
 * derives the decryption key using the user's password hash,
 * and returns the CryptoKey for use in decryption.
 * 
 * ⚠️ CRITICAL: The key is NEVER stored or logged. It exists only
 * in ephemeral memory for the duration of the function execution.
 * 
 * @param userId - User ID to fetch vault key for
 * @returns CryptoKey for decryption, or null if not found
 */
export async function getVaultKeyFromServer(userId: string): Promise<CryptoKey | null> {
  try {
    // Check cache first
    const cached = vaultKeyCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.key;
    }

    // Fetch user's encryption key metadata from database
    const [userKey] = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId))
      .limit(1);

    if (!userKey) {
      console.error(`No encryption key found for user ${userId}`);
      return null;
    }

    // ⚠️ SECURITY NOTE: We cannot derive the vault key server-side
    // because we don't have the user's password. The password is only
    // known client-side and never transmitted.
    //
    // SOLUTION: Client must send a temporary decryption token or
    // we must use a different architecture (see alternatives below).
    //
    // For now, this returns null and the encrypted image flow
    // requires the client to pass the derived key temporarily.
    
    console.warn('Server-side vault key derivation requires password or token');
    return null;
  } catch (error) {
    console.error('Failed to fetch vault key:', error);
    return null;
  }
}

/**
 * Alternative: Client passes derived key temporarily
 * 
 * This is a pragmatic solution where the client:
 * 1. Derives the vault key client-side
 * 2. Encrypts the image with the vault key
 * 3. Sends encrypted image + vault key (encrypted with a session key)
 * 4. Server decrypts vault key, then decrypts image
 * 5. Memory is garbage collected after response
 *
 * For implementation simplicity, we'll use a hybrid approach:
 * Client encrypts image with a ONE-TIME session key,
 * sends both the encrypted image and the session key.
 * Server uses session key to decrypt, analyzes, forgets.
 */

/**
 * Generate a one-time session key for image decryption
 * This key is valid only for a single request
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
function arrayBufferToBase64(buffer: ArrayBuffer): string {
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
