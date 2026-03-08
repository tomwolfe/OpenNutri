import { create } from 'zustand';

export interface LogItem {
  foodName: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'AI' | 'USDA' | 'MANUAL' | 'AI_ESTIMATE';
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
  
  fetchLogs: (date: Date, isEncryptionReady: boolean, decryptLog: (data: string, iv: string) => Promise<unknown>) => Promise<void>;
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

  fetchLogs: async (date, isEncryptionReady, decryptLog) => {
    set({ isLoading: true, error: null });
    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await fetch(`/api/log/daily?date=${dateStr}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      
      const data = await response.json();
      const rawLogs = data.logs || [];
      let processedLogs: FoodLog[] = [];

      // Decrypt logs if encryption is ready
      if (rawLogs.length > 0) {
        processedLogs = await Promise.all(
          rawLogs.map(async (log: any) => {
            let items: LogItem[] = log.logItems || [];
            
            if (isEncryptionReady && log.encryptedData && log.encryptionIv) {
              try {
                const decrypted: any = await decryptLog(log.encryptedData, log.encryptionIv);
                
                // Handle new complex encrypted object: { mealType, items, notes, imageUrl }
                if (decrypted && typeof decrypted === 'object' && !Array.isArray(decrypted)) {
                  if (decrypted.items) {
                    items = decrypted.items;
                    return {
                      ...log,
                      items,
                      mealType: decrypted.mealType || log.mealType,
                      notes: decrypted.notes || log.notes,
                      imageUrl: decrypted.imageUrl || log.imageUrl,
                    };
                  }
                }
                
                // Fallback for older format (just items array)
                items = Array.isArray(decrypted) ? decrypted : [decrypted];
              } catch (err) {
                console.error('Store: Failed to decrypt log:', log.id, err);
              }
            }
            
            return {
              ...log,
              items,
            };
          })
        );
      }

      set({ 
        logs: processedLogs, 
        isLoading: false 
      });
      
      // Calculate totals locally based on decrypted items
      get().updateTotals();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({ error: errorMessage, isLoading: false });
    }
  },

  addLogOptimistic: (mealType, items, totalCalories) => {
    const tempId = `temp-${Math.random().toString(36).substr(2, 9)}`;
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
    // Optimistic removal
    const previousLogs = get().logs;
    set((state) => ({
      logs: state.logs.filter(log => log.id !== logId),
    }));
    get().updateTotals();

    try {
      const response = await fetch(`/api/log/food?id=${logId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
    } catch (error) {
      // Rollback
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
