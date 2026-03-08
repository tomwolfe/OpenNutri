/**
 * Sync Web Worker
 * 
 * Handles bidirectional synchronization off the main thread.
 * Powered by Yjs and Dexie.
 */

import { db, type LocalFoodLog } from '../lib/db-local';
import { mergeCrdt, applyYUpdate, encodeYDoc } from '../lib/crdt';
import * as Y from 'yjs';

// We need to polyfill Buffer for Yjs in some worker environments if needed
// but usually modern workers have what they need or the bundler handles it.

/**
 * Domain-aware conflict resolution for food logs (Worker version)
 */
function resolveLogConflict(
  localLog: LocalFoodLog | undefined,
  serverLog: LocalFoodLog
): { mergedUpdate: string; mergedData: Record<string, unknown> } {
  const { mergedUpdate, mergedData } = mergeCrdt(
    localLog?.yjsData || null,
    serverLog.yjsData || null,
    localLog || serverLog,
    serverLog
  );

  if (!localLog) return { mergedUpdate, mergedData: mergedData as Record<string, unknown> };

  const doc = new Y.Doc();
  applyYUpdate(doc, mergedUpdate);
  const map = doc.getMap('data');
  let needsOverride = false;
  const currentData = mergedData as Record<string, unknown>;

  // Rule: Prefer verified data
  if (localLog.isVerified && !serverLog.isVerified) {
    if (!currentData.isVerified) {
      map.set('isVerified', true);
      map.set('totalCalories', localLog.totalCalories);
      map.set('mealType', localLog.mealType);
      map.set('aiConfidenceScore', localLog.aiConfidenceScore);
      map.set('encryptedData', localLog.encryptedData);
      map.set('encryptionIv', localLog.encryptionIv);
      needsOverride = true;
    }
  } else if (!localLog.isVerified && serverLog.isVerified) {
    if (!currentData.isVerified) {
      map.set('isVerified', true);
      map.set('totalCalories', serverLog.totalCalories);
      map.set('mealType', serverLog.mealType);
      map.set('aiConfidenceScore', serverLog.aiConfidenceScore);
      map.set('encryptedData', serverLog.encryptedData);
      map.set('encryptionIv', serverLog.encryptionIv);
      needsOverride = true;
    }
  } 
  else if (localLog.aiConfidenceScore !== null && serverLog.aiConfidenceScore !== null) {
    const diff = (localLog.aiConfidenceScore || 0) - (serverLog.aiConfidenceScore || 0);
    if (Math.abs(diff) > 0.05) {
      const preferred = diff > 0 ? localLog : serverLog;
      if (currentData.aiConfidenceScore !== preferred.aiConfidenceScore) {
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
      mergedData: map.toJSON() as Record<string, unknown>
    };
  }

  return { mergedUpdate, mergedData: currentData };
}

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    if (type === 'SYNC_DELTA') {
      const { userId, deviceId, lastSyncTimestamp } = payload;

      // 1. Process Sync Outbox (Write-Ahead Log)
      const outboxItems = await db.syncOutbox
        .where('userId')
        .equals(userId)
        .and(item => item.status === 'pending' || item.status === 'failed')
        .toArray();

      for (const item of outboxItems) {
        try {
          await db.syncOutbox.update(item.id!, { status: 'processing' });

          const response = await fetch('/api/sync/outbox/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });

          if (response.ok) {
            // Mark as synced in the actual table
            if (item.table === 'foodLogs') {
              await db.foodLogs.update(item.entityId, { synced: true, updatedAt: Date.now() });
            }
            // Remove from outbox on success
            await db.syncOutbox.delete(item.id!);
          } else {
            const error = await response.text();
            await db.syncOutbox.update(item.id!, { status: 'failed', error });
          }
        } catch (err) {
          console.error('Failed to process outbox item:', item.id, err);
          await db.syncOutbox.update(item.id!, { status: 'failed', error: String(err) });
        }
      }

      // 2. Fallback: Find unsynced that might have missed the outbox (legacy)
      const unsyncedLogs = await db.foodLogs
        .filter(log => !log.synced && log.userId === userId)
        .toArray();
...

      const unsyncedTargets = await db.userTargets
        .filter(target => !target.synced && target.userId === userId)
        .toArray();

      const unsyncedRecipes = await db.userRecipes
        .filter(recipe => !recipe.synced && recipe.userId === userId)
        .toArray();

      let pushed = 0;
      if (unsyncedLogs.length > 0 || unsyncedTargets.length > 0 || unsyncedRecipes.length > 0) {
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
          recipes: unsyncedRecipes.map(recipe => ({
            ...recipe,
            deviceId,
            version: (recipe.version || 0) + 1,
          })),
        };

        const response = await fetch('/api/sync/delta/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pushPayload),
        });

        if (response.ok) {
          const result = await response.json();
          const serverConflicts = (result.conflicts || []) as Array<{ type: string, id: string }>;
          
          for (const log of unsyncedLogs) {
            const hasConflict = serverConflicts.some((c) => c.type === 'log' && c.id === log.id);
            if (!hasConflict) {
              await db.foodLogs.update(log.id, {
                synced: true,
                version: (log.version || 0) + 1,
                deviceId,
              });
              pushed++;
            }
          }
          
          for (const recipe of unsyncedRecipes) {
            const hasConflict = serverConflicts.some((c) => c.type === 'recipe' && c.id === recipe.id);
            if (!hasConflict) {
              await db.userRecipes.update(recipe.id, {
                synced: true,
                version: (recipe.version || 0) + 1,
                deviceId,
              });
              pushed++;
            }
          }
        }
      }

      // 2. Pull
      const pullRes = await fetch(`/api/sync/delta?since=${lastSyncTimestamp}`);
      if (!pullRes.ok) throw new Error('Pull failed');
      const data = await pullRes.json();
      
      const serverLogs = (data.logs || []) as LocalFoodLog[];
      const serverRecipes = (data.recipes || []) as any[];
      let pulled = 0;

      // Sync Logs
      const pulledLogIds: string[] = [];
      for (const sLog of serverLogs) {
        if (sLog.deviceId === deviceId) continue;
        const localLog = await db.foodLogs.get(sLog.id);
        const { mergedUpdate, mergedData } = resolveLogConflict(localLog, sLog);
        
        const hasLocalChanges = localLog && !localLog.synced;
        const needsRePush = hasLocalChanges || mergedUpdate !== sLog.yjsData;

        await db.foodLogs.put({
          ...sLog,
          ...mergedData,
          yjsData: mergedUpdate,
          timestamp: new Date(((mergedData as Record<string, unknown>).timestamp as string) || sLog.timestamp),
          updatedAt: Date.now(),
          synced: !needsRePush,
          version: Math.max(localLog?.version || 0, sLog.version || 0) + 1,
        } as LocalFoodLog);
        pulledLogIds.push(sLog.id);
        pulled++;
      }

      // Sync Recipes (LWW - Last Write Wins)
      const pulledRecipeIds: string[] = [];
      for (const sRecipe of serverRecipes) {
        if (sRecipe.deviceId === deviceId) continue;
        const localRecipe = await db.userRecipes.get(sRecipe.id);
        
        if (!localRecipe || new Date(sRecipe.updatedAt) > new Date(localRecipe.updatedAt)) {
          await db.userRecipes.put({
            ...sRecipe,
            synced: true,
            updatedAt: sRecipe.updatedAt,
          });
          pulledRecipeIds.push(sRecipe.id);
          pulled++;
        }
      }

      self.postMessage({
        type: 'SYNC_DELTA_SUCCESS',
        payload: { pulled, pushed, serverTime: data.serverTime, pulledLogIds, pulledRecipeIds }
      });
    }
  } catch (err: unknown) {
    self.postMessage({ type: 'ERROR', payload: err instanceof Error ? err.message : 'Unknown error' });
  }
};
