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
 * Task 4.9: Enhanced with throttling, WiFi-only check, and exponential backoff
 */
export async function syncDelta(
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; pulled: number; pushed: number; pulledLogIds?: string[] }> {
  try {
    const deviceId = getDeviceId();
    const since = getLastSyncTimestamp();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    // 1. Task 4.9: Throttling & Connection Checks
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // Check if sync only on WiFi is enabled (default: true)
      const wifiOnly = localStorage.getItem('opennutri_sync_wifi_only') !== 'false';
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      if (wifiOnly && connection && connection.type && connection.type !== 'wifi' && connection.type !== 'ethernet') {
        console.log('SyncEngine: Skipping sync (not on WiFi)');
        return { success: false, pulled: 0, pushed: 0 };
      }

      // Exponential Backoff check
      const failureCount = parseInt(localStorage.getItem('opennutri_sync_failure_count') || '0');
      if (failureCount > 0) {
        const lastFailure = parseInt(localStorage.getItem('opennutri_sync_last_failure') || '0');
        const backoffMs = Math.min(Math.pow(2, failureCount) * 1000, 300000); // Max 5 mins
        if (Date.now() - lastFailure < backoffMs) {
          console.warn(`SyncEngine: In backoff period (${Math.round((backoffMs - (Date.now() - lastFailure)) / 1000)}s remaining)`);
          return { success: false, pulled: 0, pushed: 0 };
        }
      }

      // Throttle frequent syncs (max once every 30 seconds)
      const lastSync = parseInt(localStorage.getItem('opennutri_last_sync_attempt') || '0');
      if (Date.now() - lastSync < 30000) {
        return { success: false, pulled: 0, pushed: 0 };
      }
      localStorage.setItem('opennutri_last_sync_attempt', Date.now().toString());
    }

    const { syncDeltaInWorker, decryptBatchInWorker } = await import('@/lib/worker-client');

    // 2. Offload the main sync logic to the worker
    const { pulled, pushed, serverTime, pulledLogIds } = await syncDeltaInWorker(userId, deviceId, since, origin);

    // Reset failure count on success
    localStorage.setItem('opennutri_sync_failure_count', '0');

    const { logPrivacyEvent } = await import('@/lib/privacy-audit');
    if (pulled > 0 || pushed > 0) {
      await logPrivacyEvent('Delta Sync', 'sync', `Synced ${pushed} items up, ${pulled} items down`, 'success');
    }

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
    // Task 4.9: Record failure for exponential backoff
    if (typeof window !== 'undefined') {
      const currentFailures = parseInt(localStorage.getItem('opennutri_sync_failure_count') || '0');
      localStorage.setItem('opennutri_sync_failure_count', (currentFailures + 1).toString());
      localStorage.setItem('opennutri_sync_last_failure', Date.now().toString());
    }

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      console.warn('SyncEngine: Unauthorized. Session may be expired.');
      // Task 3: Trigger Vault Unlock UI via global event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('SYNC_AUTH_REQUIRED'));
      }
      return { success: false, pulled: 0, pushed: 0 };
    }
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
