/**
 * Sync Engine for OpenNutri
 * 
 * Handles bidirectional synchronization between Dexie (local) and Neon (cloud).
 * Decouples UI from network latency and decryption overhead.
 */

import { db, type LocalFoodLog, type DecryptedFoodLog } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';

/**
 * Background sync process for a specific date
 */
export async function syncLogsForDate(
  date: Date,
  userId: string,
  vaultKey: CryptoKey | null
): Promise<{ success: boolean; count: number }> {
  try {
    const dateStr = date.toISOString().split('T')[0];
    
    // 1. PUSH: Find unsynced local logs and push to server
    const unsyncedLogs = await db.foodLogs
      .where('synced')
      .equals(0) // Dexie stores boolean false as 0 by default in some configurations, but let's use false for clarity
      .filter(log => log.userId === userId)
      .toArray();

    // Secondary filter to ensure we catch all unsynced logs regardless of index behavior
    const trueUnsynced = unsyncedLogs.length > 0 ? unsyncedLogs : 
      await db.foodLogs.filter(log => log.synced === false && log.userId === userId).toArray();

    if (trueUnsynced.length > 0) {
      console.log(`SyncEngine: Pushing ${trueUnsynced.length} unsynced logs...`);
      for (const log of trueUnsynced) {
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
              aiConfidenceScore: log.aiConfidenceScore,
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

    // 3. DECRYPT: Decrypt new logs in background worker
    const logsToDecrypt = serverLogs.filter(log => 
      log.encryptedData && log.encryptionIv && vaultKey
    );
    
    let decryptedResults: DecryptedFoodLog[] = [];
    if (logsToDecrypt.length > 0 && vaultKey) {
      decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
    }

    // 4. PERSIST: Update local tables
    await db.transaction('rw', db.foodLogs, db.decryptedLogs, async () => {
      // Update raw logs
      const localLogs: LocalFoodLog[] = serverLogs.map(log => ({
        id: log.id,
        userId: log.userId,
        timestamp: new Date(log.timestamp),
        mealType: log.mealType,
        totalCalories: log.totalCalories,
        aiConfidenceScore: log.aiConfidenceScore,
        isVerified: log.isVerified,
        imageUrl: log.imageUrl,
        notes: log.notes,
        encryptedData: log.encryptedData,
        encryptionIv: log.encryptionIv,
        encryptionSalt: log.encryptionSalt,
        synced: true,
      }));
      await db.foodLogs.bulkPut(localLogs);

      // Update decrypted cache
      if (decryptedResults.length > 0) {
        await db.decryptedLogs.bulkPut(decryptedResults);
      }
    });

    return { success: true, count: serverLogs.length };
  } catch (error) {
    console.error('SyncEngine: Global sync error', error);
    return { success: false, count: 0 };
  }
}
