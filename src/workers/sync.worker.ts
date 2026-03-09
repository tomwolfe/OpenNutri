/**
 * Sync Web Worker
 * 
 * Handles bidirectional synchronization off the main thread.
 * Powered by Yjs and Dexie.
 */

import { db, type LocalFoodLog, type LocalUserTarget } from '../lib/db-local';
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
    (localLog || serverLog) as any,
    serverLog as any
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

/**
 * Domain-aware conflict resolution for user targets (Worker version)
 * Uses CRDT merge with business rules (prefer newer timestamps, favor weight records)
 */
function resolveTargetConflict(
  localTarget: LocalUserTarget | undefined,
  serverTarget: LocalUserTarget
): { mergedUpdate: string; mergedData: Record<string, unknown> } {
  const { mergedUpdate, mergedData } = mergeCrdt(
    localTarget?.yjsData || null,
    serverTarget.yjsData || null,
    (localTarget || serverTarget) as any,
    serverTarget as any
  );

  if (!localTarget) return { mergedUpdate, mergedData: mergedData as Record<string, unknown> };

  const doc = new Y.Doc();
  applyYUpdate(doc, mergedUpdate);
  const map = doc.getMap('data');
  let needsOverride = false;
  const currentData = mergedData as Record<string, unknown>;

  // Rule: Prefer newer timestamp for weight records (user-entered data)
  if (localTarget.weightRecord !== null || serverTarget.weightRecord !== null) {
    const localTime = localTarget.updatedAt || 0;
    const serverTime = new Date(serverTarget.updatedAt).getTime() || 0;
    
    if (localTime > serverTime && localTarget.weightRecord !== null) {
      if (currentData.weightRecord !== localTarget.weightRecord) {
        map.set('weightRecord', localTarget.weightRecord);
        needsOverride = true;
      }
    } else if (serverTime > localTime && serverTarget.weightRecord !== null) {
      if (currentData.weightRecord !== serverTarget.weightRecord) {
        map.set('weightRecord', serverTarget.weightRecord);
        needsOverride = true;
      }
    }
  }

  // Rule: Prefer higher calorie/protein targets (more ambitious goals)
  if (localTarget.calorieTarget !== null && serverTarget.calorieTarget !== null) {
    const maxCalories = Math.max(localTarget.calorieTarget, serverTarget.calorieTarget);
    if (currentData.calorieTarget !== maxCalories) {
      map.set('calorieTarget', maxCalories);
      needsOverride = true;
    }
  }

  if (localTarget.proteinTarget !== null && serverTarget.proteinTarget !== null) {
    const maxProtein = Math.max(localTarget.proteinTarget, serverTarget.proteinTarget);
    if (currentData.proteinTarget !== maxProtein) {
      map.set('proteinTarget', maxProtein);
      needsOverride = true;
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

      // Queue unsynced logs to outbox for processing
      for (const log of unsyncedLogs) {
        try {
          await db.syncOutbox.add({
            userId: log.userId,
            table: 'foodLogs',
            entityId: log.id,
            operation: 'PUT',
            payload: log,
            timestamp: Date.now(),
            status: 'pending'
          });
        } catch (err) {
          console.error('Failed to queue log for sync:', err);
        }
      }

      const unsyncedTargets = await db.userTargets
        .filter(target => !target.synced && target.userId === userId)
        .toArray();

      // Queue unsynced targets to outbox
      for (const target of unsyncedTargets) {
        try {
          await db.syncOutbox.add({
            userId: target.userId,
            table: 'userTargets',
            entityId: target.userId + '_' + target.date,
            operation: 'PUT',
            payload: target,
            timestamp: Date.now(),
            status: 'pending'
          });
        } catch (err) {
          console.error('Failed to queue target for sync:', err);
        }
      }

      const unsyncedRecipes = await db.userRecipes
        .filter(recipe => !recipe.synced && recipe.userId === userId)
        .toArray();

      // Queue unsynced recipes to outbox
      for (const recipe of unsyncedRecipes) {
        try {
          await db.syncOutbox.add({
            userId: recipe.userId,
            table: 'userRecipes',
            entityId: recipe.id,
            operation: 'PUT',
            payload: recipe,
            timestamp: Date.now(),
            status: 'pending'
          });
        } catch (err) {
          console.error('Failed to queue recipe for sync:', err);
        }
      }

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

          for (const target of unsyncedTargets) {
            const hasConflict = serverConflicts.some((c) => c.type === 'target' && c.id === `${target.userId}-${target.date}`);
            if (!hasConflict) {
              await db.userTargets.update(target.userId + '_' + target.date, {
                synced: true,
                version: (target.version || 0) + 1,
                deviceId,
              });
            }
          }

          for (const recipe of unsyncedRecipes) {
            const hasConflict = serverConflicts.some((c) => c.type === 'recipe' && c.id === recipe.id);
            if (!hasConflict) {
              await db.userRecipes.update(recipe.id, {
                synced: 1,
                version: (recipe.version || 0) + 1,
                deviceId,
              });
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
      const serverTargets = (data.targets || []) as LocalUserTarget[];
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

      // Sync Targets (CRDT merge with business rules)
      for (const sTarget of serverTargets) {
        if (sTarget.deviceId === deviceId) continue;
        const localTarget = await db.userTargets.get([sTarget.userId, sTarget.date]);
        const { mergedUpdate, mergedData } = resolveTargetConflict(localTarget, sTarget);

        const hasLocalChanges = localTarget && !localTarget.synced;
        const needsRePush = hasLocalChanges || mergedUpdate !== sTarget.yjsData;

        await db.userTargets.put({
          ...sTarget,
          ...mergedData,
          yjsData: mergedUpdate,
          updatedAt: Date.now(),
          synced: !needsRePush,
          version: Math.max(localTarget?.version || 0, sTarget.version || 0) + 1,
        });
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
