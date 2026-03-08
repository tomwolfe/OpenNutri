/**
 * Sync Engine for OpenNutri
 *
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Powered by Yjs CRDTs for robust multi-device synchronization.
 */

import { db, type LocalFoodLog, type DecryptedFoodLog, type LocalUserTarget } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';
import { mergeCrdt, encodeYDoc, createYDoc, applyYUpdate } from '@/lib/crdt';
import * as Y from 'yjs';

/**
 * Sync conflict representation
 */
export interface SyncConflict {
  type: 'log' | 'target';
  id: string;
  localVersion: number;
  serverVersion: number;
  localData?: any;
  serverData?: any;
}

/**
 * Domain-aware conflict resolution for food logs
 */
function resolveLogConflict(
  localLog: LocalFoodLog | undefined,
  serverLog: LocalFoodLog
): { mergedUpdate: string; mergedData: any } {
  // 1. Initial CRDT merge (handles property-level merge)
  const { mergedUpdate, mergedData } = mergeCrdt(
    localLog?.yjsData || null,
    serverLog.yjsData || null,
    localLog || serverLog,
    serverLog
  );

  if (!localLog) return { mergedUpdate, mergedData };

  // 2. Domain-aware overrides
  const doc = new Y.Doc();
  applyYUpdate(doc, mergedUpdate);
  const map = doc.getMap('data');
  let needsOverride = false;

  // Rule: Prefer verified data
  if (localLog.isVerified && !serverLog.isVerified) {
    if (!mergedData.isVerified) {
      map.set('isVerified', true);
      map.set('totalCalories', localLog.totalCalories);
      map.set('mealType', localLog.mealType);
      map.set('aiConfidenceScore', localLog.aiConfidenceScore);
      // If we have local verified data, we MUST preserve the encrypted payload too
      map.set('encryptedData', localLog.encryptedData);
      map.set('encryptionIv', localLog.encryptionIv);
      needsOverride = true;
    }
  } else if (!localLog.isVerified && serverLog.isVerified) {
    if (!mergedData.isVerified) {
      map.set('isVerified', true);
      map.set('totalCalories', serverLog.totalCalories);
      map.set('mealType', serverLog.mealType);
      map.set('aiConfidenceScore', serverLog.aiConfidenceScore);
      map.set('encryptedData', serverLog.encryptedData);
      map.set('encryptionIv', serverLog.encryptionIv);
      needsOverride = true;
    }
  } 
  // Rule: If neither/both verified, prefer higher AI confidence
  else if (localLog.aiConfidenceScore !== null && serverLog.aiConfidenceScore !== null) {
    const diff = (localLog.aiConfidenceScore || 0) - (serverLog.aiConfidenceScore || 0);
    if (Math.abs(diff) > 0.05) {
      const preferred = diff > 0 ? localLog : serverLog;
      if (mergedData.aiConfidenceScore !== preferred.aiConfidenceScore) {
        map.set('aiConfidenceScore', preferred.aiConfidenceScore);
        map.set('totalCalories', preferred.totalCalories);
        map.set('encryptedData', preferred.encryptedData);
        map.set('encryptionIv', preferred.encryptionIv);
        needsOverride = true;
      }
    }
  }

  if (needsOverride) {
    return {
      mergedUpdate: encodeYDoc(doc),
      mergedData: map.toJSON()
    };
  }

  return { mergedUpdate, mergedData };
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
 * Ensure an item has yjsData by seeding it if missing
 */
function ensureYjsData<T extends { yjsData?: string | null }>(item: T): T {
  if (!item.yjsData) {
    const doc = createYDoc(item as Record<string, any>);
    return { ...item, yjsData: encodeYDoc(doc) };
  }
  return item;
}

/**
 * Global Delta Sync
 * Pulls all changes since last sync and pushes local changes.
 */
export async function syncDelta(
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; pulled: number; pushed: number; conflicts?: SyncConflict[] }> {
  try {
    const deviceId = getDeviceId();
    const since = getLastSyncTimestamp();

    // 1. PUSH: Find all unsynced local data
    let unsyncedLogs = await db.foodLogs
      .filter(log => !log.synced && log.userId === userId)
      .toArray();

    let unsyncedTargets = await db.userTargets
      .filter(target => !target.synced && target.userId === userId)
      .toArray();

    // Seed yjsData for items that don't have it yet (migration step)
    unsyncedLogs = unsyncedLogs.map(ensureYjsData);
    unsyncedTargets = unsyncedTargets.map(ensureYjsData);

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
        
        // Mark pushed items as synced
        if (unsyncedLogs.length > 0) {
          for (const log of unsyncedLogs) {
            await db.foodLogs.update(log.id, {
              synced: true,
              yjsData: log.yjsData,
              version: (log.version || 0) + 1,
              deviceId,
            });
          }
        }

        if (unsyncedTargets.length > 0) {
          for (const target of unsyncedTargets) {
            await db.userTargets.update([target.userId, target.date], {
              synced: true,
              yjsData: target.yjsData,
              version: (target.version || 0) + 1,
              deviceId,
            });
          }
        }

        pushed = unsyncedLogs.length + unsyncedTargets.length;
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
      // Merge logs using Domain-Aware strategy
      for (const sLog of serverLogs) {
        if (sLog.deviceId === deviceId) continue;

        const localLog = await db.foodLogs.get(sLog.id);
        
        // Use Domain-Aware Merge
        const { mergedUpdate, mergedData } = resolveLogConflict(localLog, sLog);

        const newLocalLog: LocalFoodLog = {
          ...sLog,
          ...mergedData,
          yjsData: mergedUpdate,
          timestamp: new Date(mergedData.timestamp || sLog.timestamp),
          updatedAt: Date.now(),
          synced: true,
          version: Math.max(localLog?.version || 0, sLog.version || 0) + 1,
        };

        await db.foodLogs.put(newLocalLog);

        if (newLocalLog.encryptedData && newLocalLog.encryptionIv && vaultKey) {
          logsToDecrypt.push(newLocalLog);
        }

        pulled++;
      }


      // Merge targets using CRDT strategy
      for (const sTarget of serverTargets) {
        if (sTarget.deviceId === deviceId) continue;

        const localTarget = await db.userTargets.get([sTarget.userId, sTarget.date]);
        
        // CRDT Merge
        const { mergedUpdate, mergedData } = mergeCrdt(
          localTarget?.yjsData || null,
          sTarget.yjsData || null,
          localTarget || sTarget,
          sTarget
        );

        await db.userTargets.put({
          ...sTarget,
          ...mergedData,
          yjsData: mergedUpdate,
          synced: true,
          updatedAt: Date.now(),
          version: Math.max(localTarget?.version || 0, sTarget.version || 0) + 1,
        });
        pulled++;
      }

      // 4. DECRYPT & CACHE logs
      if (logsToDecrypt.length > 0 && vaultKey) {
        const decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
        if (decryptedResults.length > 0) {
          await db.decryptedLogs.bulkPut(decryptedResults);
        }
      }
    });

    setLastSyncTimestamp(data.serverTime || Date.now());

    return { success: true, pulled, pushed };
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
