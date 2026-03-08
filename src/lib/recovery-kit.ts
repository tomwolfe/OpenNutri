/**
 * Recovery Kit - BIP-39 Style Mnemonic Recovery
 *
 * Allows users to recover their encryption key if they forget their password.
 * Uses BIP-39 wordlist to encode the master key as human-readable mnemonics.
 *
 * Security Model:
 * - Master key (32 bytes) → encoded as 24 mnemonics
 * - Each mnemonic is 1 of 2048 words (11 bits)
 * - 24 words × 11 bits = 264 bits (256 bits key + 8 bits checksum)
 *
 * User stores mnemonics securely (paper, password manager, etc.)
 * Server NEVER sees the mnemonics or the unencrypted master key.
 */

import * as bip39 from 'bip39';
import {
  generateVaultKey,
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
} from './encryption';
import { splitMnemonic, combineShards } from './sss';

/**
 * Generate a sharded recovery kit using Shamir's Secret Sharing
 */
export async function generateShardedRecoveryKit(
  email: string,
  password: string,
  totalShards: number = 3,
  threshold: number = 2
): Promise<{
  shards: string[];
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  const kit = await generateRecoveryKit(email, password);
  const shards = splitMnemonic(kit.mnemonics, totalShards, threshold);
  
  return {
    shards,
    salt: kit.salt,
    encryptedKey: kit.encryptedKey,
    iv: kit.iv,
  };
}

/**
 * Recover vault key from shards
 */
export async function recoverVaultKeyFromShards(
  shards: string[],
  password: string
): Promise<{
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  const mnemonic = combineShards(shards);
  return recoverVaultKeyFromMnemonic(mnemonic, password);
}

/**
 * Convert a master key (Uint8Array) to BIP-39 mnemonic phrase
 * @param masterKey - The 32-byte master key
 * @returns 24-word mnemonic phrase
 */
export function masterKeyToMnemonic(masterKey: Uint8Array): string {
  // Convert Uint8Array to hex string
  const hex = Array.from(masterKey)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return bip39.entropyToMnemonic(hex);
}

/**
 * Convert BIP-39 mnemonic phrase back to master key
 * @param mnemonic - 24-word mnemonic phrase
 * @returns The 32-byte master key
 */
export function mnemonicToMasterKey(mnemonic: string): Uint8Array {
  const hex = bip39.mnemonicToEntropy(mnemonic);
  // Convert hex string to Uint8Array
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Validate if a mnemonic phrase is valid
 * @param mnemonic - Mnemonic phrase to validate
 * @returns true if valid, false otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    return bip39.validateMnemonic(mnemonic);
  } catch {
    return false;
  }
}

/**
 * Generate a recovery kit for a user
 * This creates a backup of the master key encoded as mnemonics
 *
 * @param email - User's email
 * @param password - User's password
 * @returns Recovery kit with mnemonics and key data for storage
 */
export async function generateRecoveryKit(
  email: string,
  password: string
): Promise<{
  mnemonics: string;
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  // Generate the vault key (this creates a new random master key)
  const keyData = await generateVaultKey(email, password);

  // We need to get the master key to encode it
  // First derive the base key from password
  const salt = new Uint8Array(base64ToArrayBuffer(keyData.salt));
  const baseKey = await deriveKey(password, salt);

  // Decrypt the master key
  const decryptedMasterKey = await decrypt<Uint8Array>(
    keyData.encryptedKey,
    keyData.iv,
    baseKey
  );

  // Convert master key to mnemonics
  const mnemonics = masterKeyToMnemonic(decryptedMasterKey);

  return {
    mnemonics,
    salt: keyData.salt,
    encryptedKey: keyData.encryptedKey,
    iv: keyData.iv,
  };
}

/**
 * Recover a vault key from mnemonics and password
 * This recreates the encrypted key data from the mnemonic phrase
 *
 * @param mnemonics - 24-word mnemonic phrase
 * @param password - User's password
 * @returns Vault key data (salt, encryptedKey, iv) for storage
 */
export async function recoverVaultKeyFromMnemonic(
  mnemonics: string,
  password: string
): Promise<{
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  // Validate the mnemonic first
  if (!validateMnemonic(mnemonics)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Convert mnemonics back to master key
  const masterKey = mnemonicToMasterKey(mnemonics);

  // Generate a new salt
  const salt = generateSalt();

  // Derive base key from password
  const baseKey = await deriveKey(password, salt);

  // Encrypt the master key with the derived key
  const encrypted = await encrypt(masterKey, baseKey);

  return {
    salt: arrayBufferToBase64(salt),
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

/**
 * Unlock vault using mnemonics (alternative to password)
 * This allows recovery without knowing the original password
 *
 * @param mnemonics - 24-word mnemonic phrase
 * @param newpassword - New password to set (optional, can be same as old)
 * @returns Vault key and new key data for storage
 */
export async function unlockVaultWithMnemonic(
  mnemonics: string,
  newpassword: string
): Promise<{
  vaultKey: CryptoKey;
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  // Validate the mnemonic first
  if (!validateMnemonic(mnemonics)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Convert mnemonics back to master key
  const masterKey = mnemonicToMasterKey(mnemonics);

  // Generate a new salt
  const salt = generateSalt();

  // Derive base key from NEW password
  const baseKey = await deriveKey(newpassword, salt);

  // Encrypt the master key with the new derived key
  const encrypted = await encrypt(masterKey, baseKey);

  // Import the master key as a CryptoKey
  const vaultKey = await crypto.subtle.importKey(
    'raw',
    masterKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    vaultKey,
    salt: arrayBufferToBase64(salt),
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

/**
 * Format mnemonics for display (grouped in rows)
 * @param mnemonics - Space-separated mnemonic words
 * @param wordsPerRow - Number of words per row (default: 8)
 * @returns Formatted string with newlines
 */
export function formatMnemonicsForDisplay(
  mnemonics: string,
  wordsPerRow: number = 8
): string {
  const words = mnemonics.split(' ');
  const rows: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerRow) {
    rows.push(words.slice(i, i + wordsPerRow).join(' '));
  }

  return rows.join('\n');
}

/**
 * Get mnemonic word by index (for numbered display)
 * @param mnemonics - Space-separated mnemonic words
 * @returns Array of {index, word} tuples
 */
export function getNumberedMnemonics(mnemonics: string): Array<{
  index: number;
  word: string;
}> {
  const words = mnemonics.split(' ');
  return words.map((word, index) => ({ index: index + 1, word }));
}

/**
 * Helper: Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper: Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
