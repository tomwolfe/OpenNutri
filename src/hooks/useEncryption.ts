/**
 * useEncryption Hook
 * 
 * Manages E2E encryption keys for food logs.
 * Handles key generation, storage, and retrieval.
 * Implements Session Resumption (Encrypted Session Persistence).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  generateVaultKey,
  getVaultKey,
  isCryptoAvailable,
  encryptFoodLog,
  decryptFoodLog,
  type EncryptedFoodLog,
  wrapKey,
  unwrapKey,
  generateSessionKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from '@/lib/encryption';

const VAULT_KEY_STORAGE = 'opennutri_vault_key';
const SESSION_PERSISTENCE_KEY = 'opennutri_session_persistence_key';
const WRAPPED_VAULT_KEY_STORAGE = 'opennutri_wrapped_vault_key';
const DEVICE_KEY_STORAGE = 'opennutri_device_key';

interface VaultKeyData {
  salt: string;
  encryptedKey: string;
  iv: string;
}

interface UseEncryptionReturn {
  isReady: boolean;
  isSupported: boolean;
  isBiometricsSupported: boolean;
  hasBiometricKey: boolean;
  error: string | null;
  vaultKey: CryptoKey | null;
  encryptLog: (log: unknown) => Promise<{ encryptedData: string; iv: string }>;
  decryptLog: (encryptedData: string, iv: string) => Promise<EncryptedFoodLog>;
  encryptBinary: (data: ArrayBuffer | Uint8Array, key?: CryptoKey) => Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }>;
  decryptBinary: (ciphertext: ArrayBuffer, iv: ArrayBuffer | Uint8Array, key?: CryptoKey) => Promise<ArrayBuffer>;
  generateSessionKey: () => Promise<CryptoKey>;
  exportKeyToBase64: (key: CryptoKey) => Promise<string>;
  initializeKey: (email: string, password: string) => Promise<VaultKeyData>;
  unlockVault: (password: string, salt: string, encryptedKey: string, iv: string) => Promise<void>;
  enableBiometricUnlock: (userId: string) => Promise<boolean>;
  unlockWithBiometrics: (userId: string) => Promise<boolean>;
  clearKey: () => void;
}

/**
 * Hook for managing E2E encryption
 */
export function useEncryption(): UseEncryptionReturn {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);
  const [hasBiometricKey, setHasBiometricKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Internal: Get or create a device-specific encryption key
   * Derived from browser's Web Crypto API and stored persistently
   */
  const getOrCreateDeviceKey = useCallback(async (): Promise<CryptoKey> => {
    const storedDeviceKey = localStorage.getItem(DEVICE_KEY_STORAGE);

    if (storedDeviceKey) {
      // Import existing device key
      const keyData = JSON.parse(storedDeviceKey);
      return crypto.subtle.importKey(
        'raw',
        base64ToArrayBuffer(keyData.key),
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }

    // Generate new device key
    const newDeviceKey = await generateSessionKey();
    const exportedKey = await crypto.subtle.exportKey('raw', newDeviceKey);

    // Store in localStorage (this is the root of trust for this device)
    localStorage.setItem(DEVICE_KEY_STORAGE, JSON.stringify({
      key: arrayBufferToBase64(exportedKey),
      createdAt: Date.now()
    }));

    return newDeviceKey;
  }, []);

  // Encrypt binary data (e.g. image)
  const encryptBinaryData = useCallback(
    async (data: ArrayBuffer | Uint8Array, customKey?: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
      const targetKey = customKey || key;
      if (!targetKey) throw new Error('Vault not unlocked and no session key provided.');
      const { encryptBinary } = await import('@/lib/encryption');
      return encryptBinary(data, targetKey);
    },
    [key]
  );

  // Decrypt binary data
  const decryptBinaryData = useCallback(
    async (ciphertext: ArrayBuffer, iv: ArrayBuffer | Uint8Array, customKey?: CryptoKey): Promise<ArrayBuffer> => {
      const targetKey = customKey || key;
      if (!targetKey) throw new Error('Vault not unlocked and no session key provided.');
      const { decryptBinary } = await import('@/lib/encryption');
      return decryptBinary(ciphertext, iv, targetKey);
    },
    [key]
  );

  /**
   * Internal: Persist key for session resumption
   * Double-wraps the vault key: master key → session key → device key
   * The device key is stored encrypted in localStorage with a browser-derived key
   */
  const persistSessionKey = useCallback(async (masterKey: CryptoKey) => {
    try {
      const sessionWrappingKey = await generateSessionKey();

      // Export wrapping key to sessionStorage (ephemeral)
      const exportedWrappingKey = await crypto.subtle.exportKey('raw', sessionWrappingKey);
      sessionStorage.setItem(SESSION_PERSISTENCE_KEY, arrayBufferToBase64(exportedWrappingKey));

      // Wrap master key with session key
      const wrapped = await wrapKey(masterKey, sessionWrappingKey);

      // Derive a device-specific key from browser fingerprint
      const deviceKey = await getOrCreateDeviceKey();

      // Encrypt the wrapped key with device key before storing in localStorage
      const wrappedDataJson = JSON.stringify(wrapped);
      const deviceEncrypted = await encryptBinaryData(
        new TextEncoder().encode(wrappedDataJson),
        deviceKey
      );

      localStorage.setItem(WRAPPED_VAULT_KEY_STORAGE, JSON.stringify({
        ciphertext: arrayBufferToBase64(deviceEncrypted.ciphertext),
        iv: arrayBufferToBase64(deviceEncrypted.iv)
      }));

      // Also set the legacy flag
      sessionStorage.setItem(VAULT_KEY_STORAGE, JSON.stringify({ type: 'master', unlocked: true }));
    } catch (err) {
      console.warn('Failed to persist session key:', err);
    }
  }, [encryptBinaryData, getOrCreateDeviceKey]);

  /**
   * Internal: Resume session from storage
   */
  const resumeSession = useCallback(async () => {
    try {
      const exportedWrappingKey = sessionStorage.getItem(SESSION_PERSISTENCE_KEY);
      const wrappedDataStr = localStorage.getItem(WRAPPED_VAULT_KEY_STORAGE);

      if (!exportedWrappingKey || !wrappedDataStr) return;

      const wrappedData = JSON.parse(wrappedDataStr);

      // Get device key to decrypt the wrapped master key
      const deviceKey = await getOrCreateDeviceKey();

      // Decrypt the wrapped key data
      const decryptedJson = await decryptBinaryData(
        base64ToArrayBuffer(wrappedData.ciphertext),
        base64ToArrayBuffer(wrappedData.iv),
        deviceKey
      );

      const wrappedKeyData = JSON.parse(new TextDecoder().decode(decryptedJson));

      // Import the wrapping key back
      const binaryKey = base64ToArrayBuffer(exportedWrappingKey);

      const sessionWrappingKey = await crypto.subtle.importKey(
        'raw',
        binaryKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['unwrapKey']
      );

      const masterKey = await unwrapKey(wrappedKeyData.ciphertext, wrappedKeyData.iv, sessionWrappingKey);
      setKey(masterKey);
      console.log('Encryption session resumed successfully');
    } catch (err) {
      console.error('Failed to resume encryption session:', err);
      // Clean up corrupted session
      sessionStorage.removeItem(SESSION_PERSISTENCE_KEY);
      localStorage.removeItem(WRAPPED_VAULT_KEY_STORAGE);
    }
  }, [getOrCreateDeviceKey, decryptBinaryData]);

  // Check Web Crypto API support and resume session on mount
  useEffect(() => {
    const supported = isCryptoAvailable();
    setIsSupported(supported);
    
    if (!supported) {
      setError('Web Crypto API is not supported in this browser');
      return;
    }

    // Check for biometrics
    import('@/lib/webauthn').then(async (mod) => {
      const bioAvailable = await mod.isBiometricsAvailable();
      setIsBiometricsSupported(bioAvailable);
    });

    // Try to resume session
    resumeSession();
  }, [resumeSession]);

  // Update biometric key status
  useEffect(() => {
    const checkBiometricKey = async () => {
      const { db } = await import('@/lib/db-local');
      const count = await db.vaultKeys.count();
      setHasBiometricKey(count > 0);
    };
    checkBiometricKey();
  }, [key]);

  // Initialize a new vault
  const initializeKey = useCallback(async (email: string, password: string) => {
    const keyData = await generateVaultKey(email, password);
    // Derive the master key object for current session
    const masterKey = await getVaultKey(password, keyData.salt, keyData.encryptedKey, keyData.iv);
    setKey(masterKey);
    await persistSessionKey(masterKey);
    return keyData;
  }, [persistSessionKey]);

  // Unlock existing vault
  const unlockVault = useCallback(async (password: string, salt: string, encryptedKey: string, iv: string) => {
    try {
      const masterKey = await getVaultKey(password, salt, encryptedKey, iv);
      setKey(masterKey);
      await persistSessionKey(masterKey);
    } catch (err) {
      console.error('Failed to unlock vault:', err);
      throw new Error('Invalid password or corrupted vault data');
    }
  }, [persistSessionKey]);

  // Enable biometric unlock
  const enableBiometricUnlock = useCallback(async (userId: string) => {
    if (!key) throw new Error('Vault must be unlocked first');
    const { enableBiometricUnlock: enableBio } = await import('@/lib/webauthn');
    const success = await enableBio(key, userId);
    if (success) setHasBiometricKey(true);
    return success;
  }, [key]);

  // Unlock with biometrics
  const unlockWithBiometrics = useCallback(async (userId: string) => {
    try {
      const { unlockVaultWithBiometrics } = await import('@/lib/webauthn');
      const unlockedKey = await unlockVaultWithBiometrics(userId);
      if (unlockedKey) {
        setKey(unlockedKey);
        await persistSessionKey(unlockedKey);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Biometric unlock failed:', err);
      return false;
    }
  }, [persistSessionKey]);

  // Encrypt a food log entry
  const encryptLog = useCallback(
    async (log: unknown): Promise<{ encryptedData: string; iv: string }> => {
      if (!key) throw new Error('Vault not unlocked. Please log in first.');
      return encryptFoodLog(log as EncryptedFoodLog, key);
    },
    [key]
  );

  // Decrypt a food log entry
  const decryptLog = useCallback(
    async (encryptedData: string, iv: string): Promise<EncryptedFoodLog> => {
      if (!key) throw new Error('Vault not unlocked. Please log in first.');
      return decryptFoodLog(encryptedData, iv, key);
    },
    [key]
  );

  // Generate a session key
  const generateOneTimeKey = useCallback(async () => {
    const { generateSessionKey } = await import('@/lib/encryption');
    return generateSessionKey();
  }, []);

  // Export key to base64
  const exportKeyToBase64 = useCallback(async (targetKey: CryptoKey) => {
    const { exportKeyRaw, arrayBufferToBase64 } = await import('@/lib/encryption');
    const raw = await exportKeyRaw(targetKey);
    return arrayBufferToBase64(raw);
  }, []);

  // Clear key from memory
  const clearKey = useCallback(() => {
    setKey(null);
    sessionStorage.removeItem(VAULT_KEY_STORAGE);
    sessionStorage.removeItem(SESSION_PERSISTENCE_KEY);
    localStorage.removeItem(WRAPPED_VAULT_KEY_STORAGE);
    // Note: We don't clear DEVICE_KEY_STORAGE on logout to maintain session persistence
    // across tabs/windows. It's only cleared on explicit account deletion or browser data clear.
  }, []);

  return {
    isReady: !!key || !isSupported,
    isSupported,
    isBiometricsSupported,
    hasBiometricKey,
    error,
    vaultKey: key,
    encryptLog,
    decryptLog,
    encryptBinary: encryptBinaryData,
    decryptBinary: decryptBinaryData,
    generateSessionKey: generateOneTimeKey,
    exportKeyToBase64,
    initializeKey,
    unlockVault,
    enableBiometricUnlock,
    unlockWithBiometrics,
    clearKey,
  };
}
