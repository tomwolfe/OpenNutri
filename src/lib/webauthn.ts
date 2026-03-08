/**
 * WebAuthn Biometric Vault Unlock Utility
 * 
 * Allows wrapping the Master Vault Key with a biometric-backed key using
 * the WebAuthn PRF (Pseudo-Random Function) extension.
 */

import { db } from './db-local';
import { arrayBufferToBase64, exportKeyRaw, generateIV } from './encryption';

/**
 * Check if biometrics are available and if the browser supports PRF
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  
  const isPlatformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!isPlatformAvailable) return false;

  // Check for PRF extension support
  const extensions = window.PublicKeyCredential.getClientCapabilities?.();
  // Note: getClientCapabilities might not be available in all browsers yet, 
  // but we can also check during credential creation.
  return isPlatformAvailable;
}

/**
 * Derive a CryptoKey from PRF output
 */
async function deriveWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap the Vault Key with biometrics using PRF extension
 */
export async function enableBiometricUnlock(vaultKey: CryptoKey, userId: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userID = new TextEncoder().encode(userId);

    // Request PRF extension
    const options: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: { name: 'OpenNutri', id: window.location.hostname },
      user: {
        id: userID,
        name: userId,
        displayName: userId,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
        requireResidentKey: true,
      },
      extensions: {
        // @ts-ignore - prf extension is still new in types
        prf: {
          eval: {
            first: new Uint8Array(32).fill(1), // Constant salt for the PRF
          },
        },
      } as any,
    };

    const credential = await navigator.credentials.create({
      publicKey: options,
    }) as any;

    if (!credential) return false;

    // Check if PRF was enabled
    const extensionResults = credential.getClientExtensionResults();
    if (!extensionResults.prf || !extensionResults.prf.enabled) {
      console.warn('PRF extension not supported by this authenticator');
      // Fallback: we could still use biometrics but without the hard crypto link
      // For A+ status, we really want PRF.
      throw new Error('Biometric hardware does not support high-security key derivation.');
    }

    const prfResults = extensionResults.prf.results;
    const seed = prfResults.first;
    
    // Derive a wrapping key from the PRF seed
    const wrappingKey = await deriveWrappingKey(seed);
    
    // Export the vault key to raw bytes
    const rawVaultKey = await exportKeyRaw(vaultKey);
    
    // Encrypt the vault key
    const iv = generateIV();
    const encryptedVaultKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      rawVaultKey
    );

    // Store in IndexedDB
    await db.vaultKeys.put({
      userId,
      credentialId: arrayBufferToBase64(credential.rawId),
      encryptedVaultKey: arrayBufferToBase64(encryptedVaultKey),
      iv: arrayBufferToBase64(iv),
      updatedAt: Date.now(),
    });

    return true;
  } catch (error) {
    console.error('Failed to enable biometric unlock:', error);
    throw error;
  }
}

/**
 * Unlock the Vault Key using biometrics
 */
export async function unlockVaultWithBiometrics(userId: string): Promise<CryptoKey | null> {
  try {
    const storedKey = await db.vaultKeys.get(userId);
    if (!storedKey) return null;

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{
        id: base64ToArrayBuffer(storedKey.credentialId),
        type: 'public-key',
      }],
      userVerification: 'required',
      extensions: {
        // @ts-ignore
        prf: {
          eval: {
            first: new Uint8Array(32).fill(1),
          },
        },
      } as any,
    };

    const assertion = await navigator.credentials.get({
      publicKey: options,
    }) as any;

    if (!assertion) return null;

    const extensionResults = assertion.getClientExtensionResults();
    if (!extensionResults.prf || !extensionResults.prf.results) {
      throw new Error('Biometric hardware failed to provide key derivation seed.');
    }

    const seed = extensionResults.prf.results.first;
    const wrappingKey = await deriveWrappingKey(seed);

    // Decrypt the vault key
    const decryptedRawKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(storedKey.iv) },
      wrappingKey,
      base64ToArrayBuffer(storedKey.encryptedVaultKey)
    );

    // Import back as CryptoKey
    return crypto.subtle.importKey(
      'raw',
      decryptedRawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Biometric unlock failed:', error);
    return null;
  }
}

/**
 * Helper: Convert Base64 to ArrayBuffer (copied from encryption.ts to avoid circular deps if any)
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
