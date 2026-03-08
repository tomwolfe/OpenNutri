/**
 * Sync Engine for OpenNutri
 *
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Powered by Yjs CRDTs for robust multi-device synchronization.
 */

import { db } from '@/lib/db-local';

/**
 * Sync conflict representation
 */
export interface SyncConflict {
  type: 'log' | 'target';
  id: string;
  localVersion: number;
  serverVersion: number;
  localData?: unknown;
  serverData?: unknown;
}

/**
 * Get or generate a persistent unique ID for this browser/device
 */
function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('opennutri_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('opennutri_device_id', id);
  }
  return id;
}

/**
 * Get the last sync timestamp from localStorage
 */
function getLastSyncTimestamp(): number {
  if (typeof window === 'undefined') return 0;
  const stored = localStorage.getItem('opennutri_last_sync');
  return stored ? parseInt(stored) : 0;
}

/**
 * Set the last sync timestamp in localStorage
 */
function setLastSyncTimestamp(timestamp: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('opennutri_last_sync', timestamp.toString());
}

/**
 * Global Delta Sync (Offloaded to Worker)
 */
export async function syncDelta(
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; pulled: number; pushed: number; pulledLogIds?: string[] }> {
  try {
    const { syncDeltaInWorker, decryptBatchInWorker } = await import('@/lib/worker-client');
    const deviceId = getDeviceId();
    const since = getLastSyncTimestamp();

    // 1. Offload the main sync logic to the worker
    const { pulled, pushed, serverTime, pulledLogIds } = await syncDeltaInWorker(userId, deviceId, since);

    // 2. Handle decryption using explicit pulled IDs
    if (pulledLogIds && pulledLogIds.length > 0 && vaultKey) {
      // Find logs that were explicitly pulled
      const logsToDecrypt = await db.foodLogs
        .where('id')
        .anyOf(pulledLogIds)
        .toArray();
      
      if (logsToDecrypt.length > 0) {
        const decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
        if (decryptedResults.length > 0) {
          await db.decryptedLogs.bulkPut(decryptedResults);
        }
      }
    }

    setLastSyncTimestamp(serverTime);
    return { success: true, pulled, pushed, pulledLogIds };
  } catch (error) {
    console.error('SyncEngine: Delta sync error', error);
    return { success: false, pulled: 0, pushed: 0 };
  }
}

/**
 * Background sync process for a specific date
 */
export async function syncLogsForDate(
  date: Date,
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; count: number }> {
  // Delegate to syncDelta for robust CRDT sync
  const result = await syncDelta(userId, vaultKey);
  return { success: result.success, count: result.pulled };
}

/**
 * Sync user targets
 */
export async function syncUserTargets(userId: string): Promise<void> {
  // Delegate to syncDelta for consistency
  await syncDelta(userId, null);
}
