import { create } from 'zustand';
import { db } from '@/lib/db-local';
import { syncDelta } from '@/lib/sync-engine';

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
  refreshFromDexie: (date: Date, userId: string) => Promise<void>;
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

  refreshFromDexie: async (date, userId) => {
    const dateStr = date.toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const cachedDecrypted = await db.decryptedLogs
      .where('timestamp')
      .between(startOfDay, endOfDay)
      .filter(log => log.userId === userId)
      .toArray();

    const processedLogs: FoodLog[] = cachedDecrypted.map(log => ({
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
    }));

    set({ logs: processedLogs });
    get().updateTotals();
  },

  fetchLogs: async (date, userId, vaultKey) => {
    if (!userId) return;

    // 1. Instant Load from Local Dexie Cache
    set({ isLoading: true, error: null });
    await get().refreshFromDexie(date, userId);
    set({ isLoading: false });

    // 2. Background Delta Sync (Pushes unsynced, Pulls all changes since last sync)
    // This is more efficient than date-based sync for multi-device scenarios
    syncDelta(userId, vaultKey).then((result) => {
      if (result.success && result.pulled > 0) {
        // Refresh if new logs were pulled
        get().refreshFromDexie(date, userId);
      }
    }).catch(err => {
      console.error('Delta Sync Error:', err);
    });
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
