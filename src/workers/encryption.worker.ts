/**
 * Encryption Web Worker
 * 
 * Handles heavy cryptographic operations off the main thread.
 * Specifically: Batch decryption and encryption of food logs.
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// Helper: Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decrypt a single log
 */
async function decryptLog(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<Record<string, unknown>> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: base64ToArrayBuffer(iv),
      },
      key,
      base64ToArrayBuffer(encryptedData)
    );

    const dec = new TextDecoder();
    const plaintext = dec.decode(decrypted);

    try {
      return JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      return { data: plaintext };
    }
  } catch (error) {
    console.error('Worker: Decryption failed:', error);
    throw error;
  }
}

/**
 * Worker message listener
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'DECRYPT_BATCH': {
        const { logs, keyRaw } = payload;
        
        // Import the raw key back into a CryptoKey
        const key = await crypto.subtle.importKey(
          'raw',
          keyRaw,
          { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
          false,
          ['decrypt']
        );

        const decryptedLogs = await Promise.all(
          logs.map(async (log: { id: string; userId: string; timestamp: string | number | Date; encryptedData: string; encryptionIv: string }) => {
            try {
              const data = await decryptLog(log.encryptedData, log.encryptionIv, key);
              return {
                id: log.id,
                userId: log.userId,
                timestamp: log.timestamp,
                ...data
              };
            } catch (err) {
              console.error(`Worker: Failed to decrypt log ${log.id}`, err);
              return null;
            }
          })
        );

        self.postMessage({ 
          type: 'DECRYPT_BATCH_SUCCESS', 
          payload: decryptedLogs.filter(Boolean) 
        });
        break;
      }

      case 'ENCRYPT_LOG': {
        const { data, keyRaw } = payload;
        
        const key = await crypto.subtle.importKey(
          'raw',
          keyRaw,
          { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
          false,
          ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const plaintext = JSON.stringify(data);
        
        const ciphertext = await crypto.subtle.encrypt(
          {
            name: ENCRYPTION_ALGORITHM,
            iv: iv.buffer as ArrayBuffer,
          },
          key,
          enc.encode(plaintext)
        );

        self.postMessage({
          type: 'ENCRYPT_LOG_SUCCESS',
          payload: {
            encryptedData: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv),
          }
        });
        break;
      }

      default:
        console.warn(`Worker: Unknown message type ${type}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    self.postMessage({ 
      type: 'ERROR', 
      payload: message
    });
  }
};
