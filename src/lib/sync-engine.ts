/**
 * Sync Engine for OpenNutri
 * 
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Uses a delta-sync strategy with 'updatedAt' timestamps.
 */

import { db, type LocalFoodLog, type DecryptedFoodLog, type LocalUserTarget } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';

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
    
    // 0. Get the last sync timestamp for this date/user
    // For simplicity in this version, we'll fetch everything for the date, 
    // but the API now supports 'since' if we want to optimize further.
    
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
              id: log.id,
              mealType: log.mealType,
              totalCalories: log.totalCalories,
              timestamp: log.timestamp.toISOString(),
              imageUrl: log.imageUrl,
              notes: log.notes,
              encryptedData: log.encryptedData,
              encryptionIv: log.encryptionIv,
              encryptionSalt: log.encryptionSalt,
              aiConfidenceScore: log.aiConfidenceScore,
              updatedAt: log.updatedAt,
            }),
          });

          if (response.ok) {
            await db.foodLogs.update(log.id, { synced: true });
          }
        } catch (err) {
          console.error(`SyncEngine: Failed to push log ${log.id}`, err);
        }
      }
    }

    // 2. PULL: Fetch latest logs from server
    const response = await fetch(`/api/log/daily?date=${dateStr}`);
    if (!response.ok) return { success: false, count: 0 };
    
    const data = await response.json();
    const serverLogs = (data.logs || []) as (LocalFoodLog & { logItems?: unknown[] })[];

    if (serverLogs.length === 0) return { success: true, count: 0 };

    // 3. MERGE: "Latest-Wins" strategy using updatedAt
    const logsToDecrypt: LocalFoodLog[] = [];
    
    await db.transaction('rw', db.foodLogs, db.decryptedLogs, async () => {
      for (const sLog of serverLogs) {
        const localLog = await db.foodLogs.get(sLog.id);
        const serverUpdatedAt = new Date(sLog.updatedAt).getTime();
        
        // If server version is newer or we don't have it locally, update local
        if (!localLog || serverUpdatedAt > localLog.updatedAt) {
          const newLocalLog: LocalFoodLog = {
            ...sLog,
            timestamp: new Date(sLog.timestamp),
            updatedAt: serverUpdatedAt,
            synced: true,
          };
          await db.foodLogs.put(newLocalLog);
          
          if (newLocalLog.encryptedData && newLocalLog.encryptionIv && vaultKey) {
            logsToDecrypt.push(newLocalLog);
          }
        }
      }

      // 4. DECRYPT & CACHE: Decrypt only the new/updated logs
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
