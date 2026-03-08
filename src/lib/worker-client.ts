/**
 * Encryption Worker Client
 * 
 * Helper for communicating with the encryption web worker.
 */

import { type DecryptedFoodLog } from './db-local';
import { type CoachingInsight, type MacroTargets, type IntakePoint } from './coaching';

let encryptionWorker: Worker | null = null;
let coachingWorker: Worker | null = null;
let syncWorker: Worker | null = null;
let aiWorker: Worker | null = null;

function getAIWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Worker can only be used in the browser');
  }
  
  if (!aiWorker) {
    aiWorker = new Worker(
      new URL('../workers/ai.worker.ts', import.meta.url)
    );
  }
  
  return aiWorker;
}

/**
 * Generate text embedding in the AI worker
 */
export async function generateEmbeddingInWorker(text: string): Promise<number[]> {
  const w = getAIWorker();

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, embedding, error } = event.data;

      if (type === 'embedding' && event.data.text === text) {
        w.removeEventListener('message', handler);
        resolve(embedding);
      } else if (type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(error));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({ type: 'embed', text });
  });
}

/**
 * Classify an image in the AI worker
 */
export async function classifyImageInWorker(image: unknown): Promise<any> {
  const w = getAIWorker();

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, results, error } = event.data;

      if (type === 'results') {
        w.removeEventListener('message', handler);
        resolve(results);
      } else if (type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(error));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({ type: 'classify', image });
  });
}

function getSyncWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Worker can only be used in the browser');
  }
  
  if (!syncWorker) {
    syncWorker = new Worker(
      new URL('../workers/sync.worker.ts', import.meta.url)
    );
  }
  
  return syncWorker;
}

/**
 * Perform sync delta in a web worker
 */
export async function syncDeltaInWorker(
  userId: string,
  deviceId: string,
  lastSyncTimestamp: number
): Promise<{ pulled: number; pushed: number; serverTime: number; pulledLogIds: string[]; pulledRecipeIds: string[] }> {
  const w = getSyncWorker();

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, payload } = event.data;

      if (type === 'SYNC_DELTA_SUCCESS') {
        w.removeEventListener('message', handler);
        resolve(payload);
      } else if (type === 'ERROR') {
        w.removeEventListener('message', handler);
        reject(new Error(payload));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({
      type: 'SYNC_DELTA',
      payload: { userId, deviceId, lastSyncTimestamp }
    });
  });
}

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

