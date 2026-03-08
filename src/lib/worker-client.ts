/**
 * Encryption Worker Client
 * 
 * Helper for communicating with the encryption web worker.
 */

import { type DecryptedFoodLog } from './db-local';
import { type CoachingInsight, type MacroTargets, type IntakePoint } from './coaching';

let encryptionWorker: Worker | null = null;
let coachingWorker: Worker | null = null;

function getEncryptionWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Worker can only be used in the browser');
  }
  
  if (!encryptionWorker) {
    encryptionWorker = new Worker(
      new URL('../workers/encryption.worker.ts', import.meta.url)
    );
  }
  
  return encryptionWorker;
}

function getCoachingWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Worker can only be used in the browser');
  }
  
  if (!coachingWorker) {
    coachingWorker = new Worker(
      new URL('../workers/coaching.worker.ts', import.meta.url)
    );
  }
  
  return coachingWorker;
}

/**
 * Decrypt a batch of logs using the web worker
 */
export async function decryptBatchInWorker(logs: unknown[], key: CryptoKey): Promise<DecryptedFoodLog[]> {
  const w = getEncryptionWorker();
  const keyRaw = await crypto.subtle.exportKey('raw', key);
  
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, payload } = event.data;
      
      if (type === 'DECRYPT_BATCH_SUCCESS') {
        w.removeEventListener('message', handler);
        resolve(payload as DecryptedFoodLog[]);
      } else if (type === 'ERROR') {
        w.removeEventListener('message', handler);
        reject(new Error(payload));
      }
    };
    
    w.addEventListener('message', handler);
    w.postMessage({
      type: 'DECRYPT_BATCH',
      payload: { logs, keyRaw }
    });
  });
}

/**
 * Encrypt a single log using the web worker
 */
export async function encryptLogInWorker(data: unknown, key: CryptoKey): Promise<{ encryptedData: string; iv: string }> {
  const w = getEncryptionWorker();
  const keyRaw = await crypto.subtle.exportKey('raw', key);
  
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, payload } = event.data;
      
      if (type === 'ENCRYPT_LOG_SUCCESS') {
        w.removeEventListener('message', handler);
        resolve(payload as { encryptedData: string; iv: string });
      } else if (type === 'ERROR') {
        w.removeEventListener('message', handler);
        reject(new Error(payload));
      }
    };
    
    w.addEventListener('message', handler);
    w.postMessage({
      type: 'ENCRYPT_LOG',
      payload: { data, keyRaw }
    });
  });
}

/**
 * Generate coaching insights using the web worker
 */
export async function generateInsightsInWorker(
  weightData: Array<{ timestamp: number; weight: number }>,
  intakeData: IntakePoint[],
  targets: MacroTargets
): Promise<CoachingInsight[]> {
  const w = getCoachingWorker();

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, payload } = event.data;

      if (type === 'GENERATE_INSIGHTS_SUCCESS') {
        w.removeEventListener('message', handler);
        resolve(payload as CoachingInsight[]);
      } else if (type === 'ERROR') {
        w.removeEventListener('message', handler);
        reject(new Error(payload));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({
      type: 'GENERATE_INSIGHTS',
      payload: { weightData, intakeData, targets }
    });
  });
}

