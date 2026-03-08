/**
 * useEncryption Hook
 * 
 * Manages E2E encryption keys for food logs.
 * Handles key generation, storage, and retrieval.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  generateVaultKey,
  getVaultKey,
  isCryptoAvailable,
  encryptFoodLog,
  decryptFoodLog,
  type EncryptedFoodLog,
} from '@/lib/encryption';

const VAULT_KEY_STORAGE = 'opennutri_vault_key';

interface VaultKeyData {
  salt: string;
  encryptedKey: string;
  iv: string;
}

interface UseEncryptionReturn {
  isReady: boolean;
  isSupported: boolean;
  error: string | null;
  encryptLog: (log: EncryptedFoodLog) => Promise<{ encryptedData: string; iv: string }>;
  decryptLog: (encryptedData: string, iv: string) => Promise<EncryptedFoodLog>;
  initializeKey: (email: string, password: string) => Promise<VaultKeyData>;
  unlockVault: (password: string, salt: string, encryptedKey: string, iv: string) => Promise<void>;
  clearKey: () => void;
}

/**
 * Hook for managing E2E encryption
 */
export function useEncryption(): UseEncryptionReturn {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check Web Crypto API support on mount
  useEffect(() => {
    const supported = isCryptoAvailable();
    setIsSupported(supported);
    
    if (!supported) {
      setError('Web Crypto API is not supported in this browser');
    }

    // Try to load cached key from session storage
    const cachedKey = sessionStorage.getItem(VAULT_KEY_STORAGE);
    if (cachedKey) {
      // Key is cached - will be set when password is provided
      console.log('Vault key cached in session');
    }
  }, []);

  // Initialize vault key for new users
  const initializeKey = useCallback(
    async (email: string, password: string): Promise<VaultKeyData> => {
      if (!isSupported) {
        throw new Error('Web Crypto API not supported');
      }

      try {
        const keyData = await generateVaultKey(email, password);
        
        // Store the decrypted key in session storage (cleared on tab close)
        sessionStorage.setItem(VAULT_KEY_STORAGE, JSON.stringify({
          type: 'master',
          // We don't store the actual key, just mark that we have it
          initialized: true,
        }));

        return keyData;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize vault';
        setError(message);
        throw err;
      }
    },
    [isSupported]
  );

  // Unlock vault with existing key data
  const unlockVault = useCallback(
    async (
      password: string,
      salt: string,
      encryptedKey: string,
      iv: string
    ): Promise<void> => {
      if (!isSupported) {
        throw new Error('Web Crypto API not supported');
      }

      try {
        const vaultKey = await getVaultKey(password, salt, encryptedKey, iv);
        setKey(vaultKey);

        // Mark session as unlocked
        sessionStorage.setItem(VAULT_KEY_STORAGE, JSON.stringify({
          type: 'master',
          unlocked: true,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to unlock vault';
        setError(message);
        throw err;
      }
    },
    [isSupported]
  );

  // Encrypt a food log entry
  const encryptLog = useCallback(
    async (log: EncryptedFoodLog): Promise<{ encryptedData: string; iv: string }> => {
      if (!key) {
        throw new Error('Vault not unlocked. Please log in first.');
      }
      return encryptFoodLog(log, key);
    },
    [key]
  );

  // Decrypt a food log entry
  const decryptLog = useCallback(
    async (encryptedData: string, iv: string): Promise<EncryptedFoodLog> => {
      if (!key) {
        throw new Error('Vault not unlocked. Please log in first.');
      }
      return decryptFoodLog(encryptedData, iv, key);
    },
    [key]
  );

  // Clear key from memory
  const clearKey = useCallback(() => {
    setKey(null);
    sessionStorage.removeItem(VAULT_KEY_STORAGE);
  }, []);

  return {
    isReady: !!key || !isSupported,
    isSupported,
    error,
    encryptLog,
    decryptLog,
    initializeKey,
    unlockVault,
    clearKey,
  };
}
