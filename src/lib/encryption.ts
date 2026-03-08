/**
 * E2E Encryption Service using Web Crypto API
 * 
 * Encrypts food logs client-side before sending to server.
 * Uses AES-GCM for encryption with a user-specific key.
 * 
 * Key derivation:
 * - User password → PBKDF2 → Vault Key (never sent to server)
 * - Vault Key → encrypt/decrypt food logs
 * 
 * Server stores only encrypted data and cannot read user logs.
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV for encryption
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Derive encryption key from password using PBKDF2
 * @param password - User's password or master key
 * @param salt - Random salt (store with encrypted data)
 * @returns CryptoKey for AES-GCM encryption
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key (convert Uint8Array to ArrayBuffer)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext data
 * @param plaintext - Data to encrypt (will be JSON stringified if object)
 * @param key - Encryption key from deriveKey()
 * @returns Object with ciphertext (base64) and IV
 */
export async function encrypt(
  plaintext: unknown,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string; salt?: string }> {
  try {
    const data = typeof plaintext === 'string' 
      ? plaintext 
      : JSON.stringify(plaintext);
    
    const iv = generateIV();
    const enc = new TextEncoder();
    
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      enc.encode(data)
    );

    return {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv),
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt ciphertext data
 * @param ciphertext - Encrypted data (base64)
 * @param iv - Initialization vector (base64)
 * @param key - Decryption key from deriveKey()
 * @returns Decrypted plaintext (parsed as JSON if applicable)
 */
export async function decrypt<T = unknown>(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<T> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: base64ToArrayBuffer(iv),
      },
      key,
      base64ToArrayBuffer(ciphertext)
    );

    const dec = new TextDecoder();
    const plaintext = dec.decode(decrypted);

    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(plaintext) as T;
    } catch {
      return plaintext as T;
    }
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data. Wrong password?');
  }
}

/**
 * Generate a master vault key for a user
 * This key is derived from their password and stored only in browser storage
 * @param email - User's email (used as additional context)
 * @param password - User's password
 * @returns Object with encrypted key and metadata for storage
 */
export async function generateVaultKey(email: string, password: string): Promise<{
  salt: string;
  encryptedKey: string;
  iv: string;
}> {
  const salt = generateSalt();
  const baseKey = await deriveKey(password, salt);
  
  // Generate a random master key
  const masterKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Encrypt the master key with the derived key
  const encrypted = await encrypt(masterKey, baseKey);
  
  return {
    salt: arrayBufferToBase64(salt),
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

/**
 * Retrieve vault key from storage
 * @param email - User's email
 * @param password - User's password
 * @param storedSalt - Salt from server
 * @param encryptedKey - Encrypted master key from server
 * @param iv - IV for decryption
 * @returns Decrypted master key as CryptoKey
 */
export async function getVaultKey(
  password: string,
  storedSalt: string,
  encryptedKey: string,
  iv: string
): Promise<CryptoKey> {
  const salt = new Uint8Array(base64ToArrayBuffer(storedSalt));
  const baseKey = await deriveKey(password, salt);
  
  // Decrypt the master key
  const decryptedMasterKey = await decrypt<Uint8Array>(
    encryptedKey,
    iv,
    baseKey
  );
  
  // Import the decrypted master key as a CryptoKey
  return crypto.subtle.importKey(
    'raw',
    decryptedMasterKey.buffer as ArrayBuffer,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
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

/**
 * Check if Web Crypto API is available
 */
export function isCryptoAvailable(): boolean {
  return !!(
    typeof crypto !== 'undefined' &&
    crypto.subtle
  );
}

/**
 * Hash password for authentication (client-side)
 * 
 * ⚠️ SECURITY NOTE: This uses SHA-256 client-side hashing before transmission,
 * then bcrypt on the server. This creates a vulnerability where the SHA-256 hash
 * itself becomes the effective password - an attacker with DB access could replay
 * the hash directly without cracking bcrypt.
 * 
 * Current implementation is a trade-off between:
 * - ✅ Preventing plaintext password transmission over the wire
 * - ✅ Client-side privacy (server never sees raw password)
 * - ❌ Vulnerable to hash replay attacks if DB is compromised
 * 
 * TODO: Migrate to secure auth flow where:
 * 1. Password is sent over HTTPS only (TLS 1.3)
 * 2. Server performs bcrypt/Argon2id hashing exclusively
 * 3. Client-side hashing is used ONLY for vault key derivation (PBKDF2)
 * 
 * @param password - User's plaintext password
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashForAuth(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // Use a fixed salt to ensure consistent hashing for auth purposes
  // This is NOT for encryption - just to prevent plaintext password transmission
  const data = encoder.encode(password + 'OPENNUTRI_AUTH_SALT_v1');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt binary data (e.g. image)
 * @param data - ArrayBuffer or Uint8Array to encrypt
 * @param key - Encryption key
 * @returns Object with ciphertext (ArrayBuffer) and IV (Uint8Array)
 */
export async function encryptBinary(
  data: ArrayBuffer | Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  try {
    const iv = generateIV();
    // Ensure data is an ArrayBuffer (not SharedArrayBuffer)
    const dataBuffer = data instanceof Uint8Array ? data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer : data;
    
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      dataBuffer
    );

    return {
      ciphertext,
      iv,
    };
  } catch (error) {
    console.error('Binary encryption failed:', error);
    throw new Error('Failed to encrypt binary data');
  }
}

/**
 * Decrypt binary data
 * @param ciphertext - Encrypted data (ArrayBuffer)
 * @param iv - Initialization vector (ArrayBuffer or Uint8Array)
 * @param key - Decryption key
 * @returns Decrypted data as ArrayBuffer
 */
export async function decryptBinary(
  ciphertext: ArrayBuffer,
  iv: ArrayBuffer | Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  try {
    // Ensure IV is an ArrayBuffer (not SharedArrayBuffer)
    const ivBuffer = iv instanceof Uint8Array
      ? iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
      : iv;
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: ivBuffer,
      },
      key,
      ciphertext
    );

    return decrypted;
  } catch (error) {
    console.error('Binary decryption failed:', error);
    throw new Error('Failed to decrypt binary data');
  }
}

/**
 * Food log entry structure for encryption
 */
export interface EncryptedFoodLog {
  foodName?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  mealType: string;
  timestamp: number;
  notes?: string;
  items?: Array<{
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    notes?: string;
    source?: string;
  }>;
  imageUrl?: string | null;
  imageIv?: string | null;
}

/**
 * Encrypt a food log entry
 */
export async function encryptFoodLog(
  log: EncryptedFoodLog,
  key: CryptoKey
): Promise<{ encryptedData: string; iv: string }> {
  const encrypted = await encrypt(log, key);
  return {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

/**
 * Decrypt a food log entry
 */
export async function decryptFoodLog(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<EncryptedFoodLog> {
  return decrypt<EncryptedFoodLog>(encryptedData, iv, key);
}
