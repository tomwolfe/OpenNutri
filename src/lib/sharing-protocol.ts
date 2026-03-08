/**
 * Secure Sharing Protocol for OpenNutri
 * 
 * Implements a zero-knowledge sharing mechanism using asymmetric encryption (ECDH/RSA).
 * 
 * Flow:
 * 1. Recipient generates a temporary key pair (Private/Public).
 * 2. Recipient sends Public Key to Owner.
 * 3. Owner encrypts their Vault Key with Recipient's Public Key.
 * 4. Owner sends Encrypted Vault Key to Recipient.
 * 5. Recipient decrypts Vault Key using their Private Key.
 */

import { arrayBufferToBase64 } from './encryption';

/**
 * Generate a temporary asymmetric key pair for sharing
 * Uses RSA-OAEP for simplicity and compatibility
 */
export async function generateSharingKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a public key to Base64 string
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import a public key from Base64 string
 */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const binaryString = atob(base64Key);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return crypto.subtle.importKey(
    'spki',
    bytes.buffer as ArrayBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt']
  );
}

/**
 * Wrap (encrypt) a symmetric vault key with a public key
 */
export async function wrapVaultKey(vaultKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
  // 1. Export the symmetric vault key to raw format
  const rawKey = await crypto.subtle.exportKey('raw', vaultKey);
  
  // 2. Encrypt the raw key with the recipient's public key
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawKey
  );
  
  return arrayBufferToBase64(encryptedKey);
}

/**
 * Unwrap (decrypt) a symmetric vault key using a private key
 */
export async function unwrapVaultKey(encryptedVaultKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
  // 1. Decode base64
  const binaryString = atob(encryptedVaultKeyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // 2. Decrypt with private key
  const rawKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    bytes.buffer as ArrayBuffer
  );
  
  // 3. Import as a symmetric AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}
