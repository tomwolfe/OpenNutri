/**
 * Sync Engine for OpenNutri
 * 
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Uses a delta-sync strategy with 'updatedAt' timestamps.
 */

import { db, type LocalFoodLog, type DecryptedFoodLog, type LocalUserTarget } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';

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
        const serverVersion = sLog.version || 0;
        const localVersion = localLog?.version || 0;
        
        // If server version is higher, update local
        if (!localLog || serverVersion > localVersion) {
          const newLocalLog: LocalFoodLog = {
            ...sLog,
            timestamp: new Date(sLog.timestamp),
            updatedAt: new Date(sLog.updatedAt).getTime(),
            synced: true,
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
