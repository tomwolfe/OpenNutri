/**
 * Sync Engine for OpenNutri
 *
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Uses a delta-sync strategy with timestamps and Last-Write-Wins conflict resolution.
 */

import { db, type LocalFoodLog, type DecryptedFoodLog, type LocalUserTarget } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';

/**
 * Sync conflict representation
 */
export interface SyncConflict {
  type: 'log' | 'target';
  id: string;
  localVersion: number;
  serverVersion: number;
  localData?: {
    foodName?: string;
    calories?: number;
    timestamp?: string;
    mealType?: string;
    updatedAt?: number;
  };
  serverData?: {
    foodName?: string;
    calories?: number;
    timestamp?: string;
    mealType?: string;
    updatedAt?: number;
  };
}

/**
 * Deep equality check for food log items
 */
function itemsAreEqual(items1: any[], items2: any[]): boolean {
  if (items1.length !== items2.length) return false;
  const sorted1 = [...items1].sort((a, b) => a.foodName.localeCompare(b.foodName));
  const sorted2 = [...items2].sort((a, b) => a.foodName.localeCompare(b.foodName));
  return sorted1.every((item, i) =>
    item.foodName === sorted2[i].foodName &&
    item.calories === sorted2[i].calories &&
    item.protein === sorted2[i].protein &&
    item.carbs === sorted2[i].carbs &&
    item.fat === sorted2[i].fat
  );
}

/**
 * Merge items from two versions of a log
 * Uses Last-Write-Wins strategy based on updatedAt timestamp
 */
function mergeItems(localItems: any[], serverItems: any[], localUpdatedAt: number, serverUpdatedAt: number): any[] {
  // Last-Write-Wins: use the items from the most recently updated version
  if (serverUpdatedAt > localUpdatedAt) {
    return serverItems;
  }
  return localItems;
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
 * Global Delta Sync
 * Pulls all changes since last sync and pushes local changes.
 * This is more efficient than date-based sync for multi-device scenarios.
 * 
 * @returns Object with success status, pulled/pushed counts, and any conflicts detected
 */
export async function syncDelta(
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; pulled: number; pushed: number; conflicts?: SyncConflict[] }> {
  try {
    const deviceId = getDeviceId();
    const since = getLastSyncTimestamp();

    // 1. PUSH: Find all unsynced local data
    const unsyncedLogs = await db.foodLogs
      .filter(log => !log.synced && log.userId === userId)
      .toArray();

    const unsyncedTargets = await db.userTargets
      .filter(target => !target.synced && target.userId === userId)
      .toArray();

    let pushed = 0;
    const conflicts: SyncConflict[] = [];

    if (unsyncedLogs.length > 0 || unsyncedTargets.length > 0) {
      console.log(`SyncEngine: Pushing ${unsyncedLogs.length} logs and ${unsyncedTargets.length} targets...`);

      const pushPayload = {
        logs: unsyncedLogs.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
          deviceId,
          version: (log.version || 0) + 1,
        })),
        targets: unsyncedTargets.map(target => ({
          ...target,
          deviceId,
          version: (target.version || 0) + 1,
        })),
      };

      const response = await fetch('/api/sync/delta/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushPayload),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Collect conflicts from server response
        if (result.conflicts && Array.isArray(result.conflicts)) {
          conflicts.push(...result.conflicts);
        }

        // Mark pushed items as synced (excluding conflicts)
        const conflictedIds = new Set(result.conflicts?.map((c: SyncConflict) => c.id) || []);
        
        if (unsyncedLogs.length > 0) {
          for (const log of unsyncedLogs) {
            if (!conflictedIds.has(log.id)) {
              await db.foodLogs.update(log.id, {
                synced: true,
                version: (log.version || 0) + 1,
                deviceId,
              });
            }
          }
        }

        if (unsyncedTargets.length > 0) {
          for (const target of unsyncedTargets) {
            const targetId = `${target.userId}-${target.date}`;
            if (!conflictedIds.has(targetId)) {
              await db.userTargets.update([target.userId, target.date], {
                synced: true,
                version: (target.version || 0) + 1,
                deviceId,
              });
            }
          }
        }

        pushed = unsyncedLogs.length + unsyncedTargets.length - conflicts.length;
      }
    }

    // 2. PULL: Fetch all changes since last sync
    const response = await fetch(`/api/sync/delta?since=${since}`);
    if (!response.ok) {
      return { success: false, pulled: 0, pushed };
    }

    const data = await response.json();
    const serverLogs = (data.logs || []) as LocalFoodLog[];
    const serverTargets = (data.targets || []) as LocalUserTarget[];

    let pulled = 0;

    // 3. MERGE: Update local Dexie with server data
    const logsToDecrypt: LocalFoodLog[] = [];

    await db.transaction('rw', db.foodLogs, db.decryptedLogs, db.userTargets, async () => {
      // Merge logs using Last-Write-Wins (LWW) strategy
      for (const sLog of serverLogs) {
        // Skip if this change originated from this device
        if (sLog.deviceId === deviceId) continue;

        const localLog = await db.foodLogs.get(sLog.id);
        const serverUpdatedAt = new Date(sLog.updatedAt).getTime();
        const localUpdatedAt = localLog?.updatedAt || 0;

        // Last-Write-Wins: use the most recently updated version
        // This ensures the latest human action is preserved regardless of version numbers
        if (!localLog || serverUpdatedAt > localUpdatedAt) {
          const newLocalLog: LocalFoodLog = {
            ...sLog,
            timestamp: new Date(sLog.timestamp),
            updatedAt: serverUpdatedAt,
            synced: true,
            version: sLog.version || 0,
          };

          await db.foodLogs.put(newLocalLog);

          if (newLocalLog.encryptedData && newLocalLog.encryptionIv && vaultKey) {
            logsToDecrypt.push(newLocalLog);
          }

          pulled++;
        }
      }

      // Merge targets
      for (const sTarget of serverTargets) {
        if (sTarget.deviceId === deviceId) continue;

        const localTarget = await db.userTargets.get([sTarget.userId, sTarget.date]);
        const serverUpdatedAt = new Date(sTarget.updatedAt).getTime();
        const localUpdatedAt = localTarget?.updatedAt || 0;

        if (!localTarget || serverUpdatedAt > localUpdatedAt) {
          await db.userTargets.put({
            ...sTarget,
            synced: true,
            updatedAt: serverUpdatedAt,
          });
          pulled++;
        }
      }

      // 4. DECRYPT & CACHE logs
      if (logsToDecrypt.length > 0 && vaultKey) {
        const decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
        if (decryptedResults.length > 0) {
          await db.decryptedLogs.bulkPut(decryptedResults);
        }
      }
    });

    // 5. Update last sync timestamp
    setLastSyncTimestamp(data.serverTime || Date.now());

    return { 
      success: conflicts.length === 0, 
      pulled, 
      pushed,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  } catch (error) {
    console.error('SyncEngine: Delta sync error', error);
    return { success: false, pulled: 0, pushed: 0 };
  }
}

/**
 * Background sync process for a specific date
 * Performs delta-sync to minimize bandwidth and handle multi-device updates.
 */
export async function syncLogsForDate(
  date: Date,
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; count: number }> {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const deviceId = getDeviceId();
    
    // 1. PUSH: Find unsynced local logs and push to server
    const unsyncedLogs = await db.foodLogs
      .filter(log => !log.synced && log.userId === userId)
      .toArray();

    if (unsyncedLogs.length > 0) {
      console.log(`SyncEngine: Pushing ${unsyncedLogs.length} unsynced logs...`);
      for (const log of unsyncedLogs) {
        try {
          const response = await fetch('/api/log/food', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...log,
              timestamp: log.timestamp.toISOString(),
              deviceId,
              version: (log.version || 0) + 1, // Increment version on update
            }),
          });

          if (response.ok) {
            const { logId } = await response.json();
            await db.foodLogs.update(log.id, { 
              synced: true, 
              version: (log.version || 0) + 1,
              deviceId 
            });
          }
        } catch (err) {
          console.error(`SyncEngine: Failed to push log ${log.id}`, err);
        }
      }
    }

    // 2. PULL: Fetch latest logs from server
    // We only pull logs with a version higher than what we have locally for this date
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const localLogsForDate = await db.foodLogs
      .where('timestamp')
      .between(startOfDay, endOfDay)
      .toArray();
    
    const maxLocalVersion = Math.max(0, ...localLogsForDate.map(l => l.version || 0));

    const response = await fetch(`/api/log/daily?date=${dateStr}&v=${maxLocalVersion}`);
    if (!response.ok) return { success: false, count: 0 };
    
    const data = await response.json();
    const serverLogs = (data.logs || []) as (LocalFoodLog & { logItems?: unknown[] })[];

    if (serverLogs.length === 0) return { success: true, count: 0 };

    // 3. MERGE: Update local Dexie with server data
    const logsToDecrypt: LocalFoodLog[] = [];

    await db.transaction('rw', db.foodLogs, db.decryptedLogs, async () => {
      for (const sLog of serverLogs) {
        // Skip if this change originated from this device (and we already have it)
        if (sLog.deviceId === deviceId) continue;

        const localLog = await db.foodLogs.get(sLog.id);
        const serverUpdatedAt = new Date(sLog.updatedAt).getTime();
        const localUpdatedAt = localLog?.updatedAt || 0;

        // Last-Write-Wins: use the most recently updated version
        // This ensures the latest human action is preserved regardless of version numbers
        if (!localLog || serverUpdatedAt > localUpdatedAt) {
          const newLocalLog: LocalFoodLog = {
            ...sLog,
            timestamp: new Date(sLog.timestamp),
            updatedAt: serverUpdatedAt,
            synced: true,
            version: sLog.version || 0,
          };

          await db.foodLogs.put(newLocalLog);

          if (newLocalLog.encryptedData && newLocalLog.encryptionIv && vaultKey) {
            logsToDecrypt.push(newLocalLog);
          }
        }
      }

      // 4. DECRYPT & CACHE
      if (logsToDecrypt.length > 0 && vaultKey) {
        const decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
        if (decryptedResults.length > 0) {
          await db.decryptedLogs.bulkPut(decryptedResults);
        }
      }
    });

    return { success: true, count: serverLogs.length };
  } catch (error) {
    console.error('SyncEngine: Global sync error', error);
    return { success: false, count: 0 };
  }
}

/**
 * Sync user targets (weight, calorie goals)
 */
export async function syncUserTargets(userId: string): Promise<void> {
  try {
    // 1. PUSH unsynced targets
    const unsynced = await db.userTargets
      .filter(t => !t.synced && t.userId === userId)
      .toArray();
      
    for (const target of unsynced) {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      if (res.ok) {
        await db.userTargets.update([target.userId, target.date], { synced: true });
      }
    }

    // 2. PULL latest targets (last 30 days)
    const res = await fetch('/api/targets');
    if (res.ok) {
      const { targets } = await res.json();
      for (const sTarget of targets) {
        const serverUpdatedAt = new Date(sTarget.updatedAt).getTime();
        const local = await db.userTargets.get([userId, sTarget.date]);
        
        if (!local || serverUpdatedAt > local.updatedAt) {
          await db.userTargets.put({
            ...sTarget,
            synced: true,
            updatedAt: serverUpdatedAt,
          });
        }
      }
    }
  } catch (err) {
    console.error('SyncEngine: Targets sync error', err);
  }
}
