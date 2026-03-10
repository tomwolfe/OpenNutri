/**
 * useDailyLogs Hook
 *
 * Reactive hook for fetching daily food logs using Dexie live queries.
 * Replaces Zustand store with direct IndexedDB reactivity.
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DecryptedFoodLog } from '@/lib/db-local';
import { syncDelta, type SyncConflict } from '@/lib/sync-engine';
import { type Micronutrients } from '@/types/food';

export interface LogItem {
  foodName: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients?: Micronutrients;
  source: 'AI' | 'USDA' | 'MANUAL' | 'AI_ESTIMATE' | 'OPEN_FACTS';
  notes?: string;
  isEnhancing?: boolean;
}

export interface FoodLog {
  id: string;
  mealType: string;
  totalCalories: number;
  aiConfidenceScore: number;
  isVerified: boolean;
  timestamp: string;
  imageUrl?: string | null;
  imageIv?: string | null;
  notes?: string | null;
  items: LogItem[];
  encryptedData?: string | null;
  encryptionIv?: string | null;
}

export interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients: Micronutrients;
  activeEnergyBurned?: number;
  netCalories: number;
}

export interface UseDailyLogsReturn {
  logs: FoodLog[];
  dailyTotals: DailyTotals;
  isLoading: boolean;
  error: string | null;
  triggerSync: (userId: string, vaultKey: CryptoKey | null) => Promise<{ success?: boolean; pulled?: number }>;
  removeLog: (logId: string) => Promise<boolean>;
  resolveConflicts: (conflicts: SyncConflict[], resolution: 'keep-local' | 'keep-server' | 'keep-newest') => Promise<void>;
}

/**
 * Convert DecryptedFoodLog from Dexie to FoodLog format
 */
function convertToFoodLog(log: DecryptedFoodLog): FoodLog {
  return {
    id: log.id,
    mealType: log.mealType || 'unknown',
    totalCalories: log.totalCalories || 0,
    aiConfidenceScore: 0,
    isVerified: true,
    timestamp: log.timestamp.toISOString(),
    items: log.items as LogItem[],
    notes: log.notes,
    imageUrl: log.imageUrl,
    imageIv: log.imageIv,
  };
}

/**
 * Calculate daily totals from logs and health data
 */
function calculateDailyTotals(logs: FoodLog[], activeEnergyBurned: number = 0): DailyTotals {
  const totals = logs.reduce(
    (acc, log) => {
      log.items.forEach(item => {
        acc.calories += item.calories || 0;
        acc.protein += item.protein || 0;
        acc.carbs += item.carbs || 0;
        acc.fat += item.fat || 0;

        if (item.micronutrients) {
          Object.entries(item.micronutrients).forEach(([key, value]) => {
            if (typeof value === 'number') {
              const k = key as keyof Micronutrients;
              acc.micronutrients[k] = (acc.micronutrients[k] || 0) + value;
            }
          });
        }
      });
      return acc;
    },
    { 
      calories: 0, 
      protein: 0, 
      carbs: 0, 
      fat: 0,
      micronutrients: {
        fiber: 0,
        sugar: 0,
        sodium: 0,
        potassium: 0,
        calcium: 0,
        iron: 0,
        vitaminC: 0,
        saturatedFat: 0,
        cholesterol: 0,
      } as Micronutrients
    }
  );

  return {
    ...totals,
    activeEnergyBurned,
    netCalories: totals.calories - activeEnergyBurned,
  };
}

/**
 * Hook for reactive daily logs from IndexedDB
 */
export function useDailyLogs(
  selectedDate: Date,
  userId: string | undefined
): UseDailyLogsReturn {
  // Calculate date boundaries using local time
  const { startOfDay, endOfDay, dateStr } = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    return { startOfDay: start, endOfDay: end, dateStr };
  }, [selectedDate]);

  // Live query to Dexie - automatically updates when data changes
  const decryptedLogs = useLiveQuery<DecryptedFoodLog[]>(
    async () => {
      if (!userId) return [];
      return db.decryptedLogs
        .where('timestamp')
        .between(startOfDay, endOfDay)
        .filter(log => log.userId === userId)
        .toArray();
    },
    [userId, startOfDay, endOfDay]
  );

  // Live query for health data
  const healthData = useLiveQuery(
    async () => {
      if (!userId) return null;
      return await db.healthData.get([userId, dateStr]);
    },
    [userId, dateStr]
  );

  // Convert logs to UI format
  const logs: FoodLog[] = useMemo(
    () => (decryptedLogs || []).map(convertToFoodLog),
    [decryptedLogs]
  );

  // Calculate totals
  const dailyTotals = useMemo(
    () => calculateDailyTotals(logs, healthData?.activeCalories || 0),
    [logs, healthData]
  );

  // Trigger background sync
  const triggerSync = async (syncUserId: string, syncVaultKey: CryptoKey | null): Promise<{ success?: boolean; pulled?: number }> => {
    try {
      const result = await syncDelta(syncUserId, syncVaultKey);
      return { success: result.success, pulled: result.pulled };
    } catch (err) {
      console.error('Sync error:', err);
      return {};
    }
  };

  // Resolve conflicts based on user's choice
  const resolveConflicts = async (
    conflicts: SyncConflict[],
    resolution: 'keep-local' | 'keep-server' | 'keep-newest'
  ) => {
    for (const conflict of conflicts) {
      if (conflict.type === 'log') {
        if (resolution === 'keep-server') {
          // Fetch server version and overwrite local
          const response = await fetch(`/api/log/daily?id=${conflict.id}`);
          if (response.ok) {
            const serverData = await response.json();
            await db.foodLogs.update(conflict.id, {
              ...serverData,
              synced: true,
              version: serverData.version,
            });
          }
        } else if (resolution === 'keep-local') {
          // Re-push local version with incremented version number
          const localLog = await db.foodLogs.get(conflict.id);
          if (localLog) {
            await fetch('/api/log/food', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...localLog,
                version: conflict.localVersion + 1,
              }),
            });
            await db.foodLogs.update(conflict.id, {
              version: conflict.localVersion + 1,
              synced: true,
            });
          }
        } else if (resolution === 'keep-newest') {
          // Use the version with the most recent updatedAt timestamp
          const localLog = await db.foodLogs.get(conflict.id);
          const localUpdatedAt = localLog?.updatedAt || 0;
          const serverUpdatedAt = (conflict.serverData as any)?.updatedAt || 0;

          if (serverUpdatedAt > localUpdatedAt) {
            const response = await fetch(`/api/log/daily?id=${conflict.id}`);
            if (response.ok) {
              const serverData = await response.json();
              await db.foodLogs.update(conflict.id, {
                ...serverData,
                synced: true,
                version: serverData.version,
              });
            }
          } else {
            await db.foodLogs.update(conflict.id, {
              version: conflict.localVersion + 1,
              synced: true,
            });
          }
        }
      }
    }
  };

  // Delete a log
  const removeLog = async (logId: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      // 1. Remove from local tables
      await db.foodLogs.delete(logId);
      await db.decryptedLogs.delete(logId);

      // 2. Add to Sync Outbox so the server knows to delete it
      await db.syncOutbox.add({
        userId: userId,
        table: 'foodLogs',
        entityId: logId,
        operation: 'DELETE',
        payload: { id: logId },
        timestamp: Date.now(),
        status: 'pending'
      });

      return true;
    } catch (error) {
      console.error('Failed to delete log:', error);
      return false;
    }
  };

  return {
    logs,
    dailyTotals,
    isLoading: !decryptedLogs,
    error: null,
    triggerSync,
    removeLog,
    resolveConflicts,
  };
}
