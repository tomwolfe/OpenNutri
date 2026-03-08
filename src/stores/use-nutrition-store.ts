import { create } from 'zustand';
import { db, type DecryptedFoodLog, type LocalFoodLog } from '@/lib/db-local';
import { decryptBatchInWorker } from '@/lib/worker-client';

export interface LogItem {
  foodName: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
}

interface NutritionStore {
  // State
  selectedDate: Date;
  logs: FoodLog[];
  dailyTotals: DailyTotals;
  isLoading: boolean;
  error: string | null;
  
  // UI Flags
  isScanning: boolean;
  isManualEntryOpen: boolean;
  selectedMealType: string;

  // Actions
  setSelectedDate: (date: Date) => void;
  setScanning: (isScanning: boolean) => void;
  setManualEntryOpen: (isOpen: boolean) => void;
  setSelectedMealType: (mealType: string) => void;
  
  fetchLogs: (date: Date, userId: string | undefined, vaultKey: CryptoKey | null) => Promise<void>;
  addLogOptimistic: (mealType: string, items: LogItem[], totalCalories: number) => string; // returns tempId
  removeLog: (logId: string) => Promise<void>;
  updateTotals: () => void;
}

export const useNutritionStore = create<NutritionStore>((set, get) => ({
  // Initial State
  selectedDate: new Date(),
  logs: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  isLoading: false,
  error: null,
  
  isScanning: false,
  isManualEntryOpen: false,
  selectedMealType: 'breakfast',

  // Actions
  setSelectedDate: (date) => set({ selectedDate: date }),
  setScanning: (isScanning) => set({ isScanning }),
  setManualEntryOpen: (isOpen) => set({ isManualEntryOpen: isOpen }),
  setSelectedMealType: (mealType) => set({ selectedMealType: mealType }),

  fetchLogs: async (date, userId, vaultKey) => {
    if (!userId) return;
    
    set({ isLoading: true, error: null });
    try {
      const dateStr = date.toISOString().split('T')[0];
      const startOfDay = new Date(dateStr);
      const endOfDay = new Date(dateStr);
      endOfDay.setHours(23, 59, 59, 999);

      // 1. Try to fetch from Local IndexedDB first (Dexie)
      const cachedDecrypted = await db.decryptedLogs
        .where('timestamp')
        .between(startOfDay, endOfDay)
        .filter(log => log.userId === userId)
        .toArray();

      if (cachedDecrypted.length > 0) {
        // Map to FoodLog interface
        const logs: FoodLog[] = cachedDecrypted.map(log => ({
          id: log.id,
          mealType: log.mealType || 'unknown',
          totalCalories: log.totalCalories || 0,
          aiConfidenceScore: 0,
          isVerified: true,
          timestamp: log.timestamp.toISOString(),
          items: log.items as LogItem[],
          notes: log.notes,
        }));

        set({ logs, isLoading: false });
        get().updateTotals();
      }

      // 2. Fetch from server
      const response = await fetch(`/api/log/daily?date=${dateStr}`);
      if (!response.ok) throw new Error('Failed to fetch logs from server');
      
      const data = await response.json();
      const rawLogs = (data.logs || []) as (LocalFoodLog & { logItems?: LogItem[] })[];
      
      // 3. Process and Decrypt server logs
      const logsToDecrypt = rawLogs.filter(log => 
        log.encryptedData && log.encryptionIv && vaultKey
      );
      
      let decryptedResults: DecryptedFoodLog[] = [];
      if (logsToDecrypt.length > 0 && vaultKey) {
        decryptedResults = await decryptBatchInWorker(logsToDecrypt, vaultKey);
      }

      // 4. Merge results
      const processedLogs: FoodLog[] = rawLogs.map(log => {
        const decrypted = decryptedResults.find(d => d.id === log.id);
        if (decrypted) {
          return {
            id: log.id,
            mealType: decrypted.mealType || log.mealType || 'unknown',
            totalCalories: decrypted.totalCalories || 0,
            aiConfidenceScore: log.aiConfidenceScore || 0,
            isVerified: log.isVerified,
            timestamp: new Date(log.timestamp).toISOString(),
            items: decrypted.items as LogItem[],
            notes: decrypted.notes || log.notes,
            imageUrl: decrypted.imageUrl || log.imageUrl,
          };
        }
        return {
          id: log.id,
          mealType: log.mealType || 'unknown',
          totalCalories: log.totalCalories || 0,
          aiConfidenceScore: log.aiConfidenceScore || 0,
          isVerified: log.isVerified,
          timestamp: new Date(log.timestamp).toISOString(),
          items: log.logItems || [],
          notes: log.notes,
          imageUrl: log.imageUrl,
        };
      });

      // 5. Update Local Cache
      await db.transaction('rw', db.foodLogs, db.decryptedLogs, async () => {
        // Store raw encrypted logs
        const localLogs: LocalFoodLog[] = rawLogs.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp),
          synced: true,
        }));
        await db.foodLogs.bulkPut(localLogs);

        // Store decrypted logs for instant access next time
        if (decryptedResults.length > 0) {
          await db.decryptedLogs.bulkPut(decryptedResults);
        }
      });

      set({ 
        logs: processedLogs, 
        isLoading: false 
      });
      
      get().updateTotals();
    } catch (error: unknown) {
      console.error('fetchLogs error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({ error: errorMessage, isLoading: false });
    }
  },

  addLogOptimistic: (mealType, items, totalCalories) => {
    const tempId = `temp-${Math.random().toString(36).substring(2, 11)}`;
    const newLog: FoodLog = {
      id: tempId,
      mealType,
      totalCalories,
      aiConfidenceScore: 1,
      isVerified: true,
      timestamp: new Date().toISOString(),
      items,
    };

    set((state) => ({
      logs: [newLog, ...state.logs],
    }));
    
    get().updateTotals();
    return tempId;
  },

  removeLog: async (logId) => {
    const previousLogs = get().logs;
    set((state) => ({
      logs: state.logs.filter(log => log.id !== logId),
    }));
    get().updateTotals();

    try {
      const response = await fetch(`/api/log/food?id=${logId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      
      await db.foodLogs.delete(logId);
      await db.decryptedLogs.delete(logId);
    } catch (error) {
      set({ logs: previousLogs });
      get().updateTotals();
      console.error('Failed to delete log:', error);
    }
  },

  updateTotals: () => {
    const logs = get().logs;
    const totals = logs.reduce(
      (acc, log) => {
        log.items.forEach(item => {
          acc.calories += item.calories || 0;
          acc.protein += item.protein || 0;
          acc.carbs += item.carbs || 0;
          acc.fat += item.fat || 0;
        });
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    set({ dailyTotals: totals });
  },
}));
