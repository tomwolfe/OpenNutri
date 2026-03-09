/**
 * useCoaching Hook
 *
 * Fetches and manages coaching insights with client-side analysis for privacy.
 * Updated to use local-first data from Dexie and support actionable insights.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  type CoachingInsight, 
  type IntakePoint,
  type MacroTargets,
  type CoachingAction
} from '@/lib/coaching';
import { db } from '@/lib/db-local';
import { generateInsightsInWorker } from '@/lib/worker-client';
import { decryptFoodLog } from '@/lib/encryption';

export interface TrendSummary {
  dataQuality: {
    weightEntries: number;
    loggingDays: number;
    hasEnoughData: boolean;
  };
  currentStatus: {
    avgCalories: number;
    avgProtein: number;
    currentWeight: number | null;
  };
}

export interface CoachingData {
  insights: CoachingInsight[];
  trendSummary: TrendSummary;
  targets: MacroTargets;
}

export interface UseCoachingOptions {
  /** Auto-refresh interval in milliseconds (default: 60000 = 1 min) */
  refreshInterval?: number;
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
  /** User ID for local data filtering */
  userId?: string;
  /** Shared vault key for shared views */
  sharedVaultKey?: CryptoKey | null;
}

/**
 * Hook to fetch coaching insights with local analysis for privacy
 */
export function useCoaching(options: UseCoachingOptions = {}) {
  const { 
    refreshInterval = 60000, 
    autoRefresh = true,
    userId,
    sharedVaultKey
  } = options;

  const [data, setData] = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch targets and weight records from server (minimal data)
      const dataUrl = sharedVaultKey ? `/api/share/vault/data?userId=${userId}` : '/api/coaching/data';
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error('Failed to fetch coaching data');
      const raw = await response.json();
      
      const weightData = raw.weightRecords
        .filter((r: { weight: number | string | null }) => r.weight !== null)
        .map((r: { date: string | number | Date; weight: number | string }) => ({
          timestamp: new Date(r.date).getTime(),
          weight: Number(r.weight),
        }));

      // 2. Get intake data from Local Dexie (already decrypted) OR from Shared Logs
      let intakeDataPoints: IntakePoint[] = [];

      if (sharedVaultKey) {
        // Fetch and decrypt shared logs for the recipient
        const sharedLogsRes = await fetch(`/api/share/logs?userId=${userId}`);
        const { logs } = await sharedLogsRes.json();

        const intakeByDay = new Map<string, IntakePoint>();
        for (const log of logs) {
          // Decrypt shared log using the shared vault key
          const decrypted = await decryptFoodLog(log.encryptedData, log.encryptionIv, sharedVaultKey);

          const dateKey = new Date(decrypted.timestamp).toISOString().split('T')[0];
          const existing = intakeByDay.get(dateKey) || {
            timestamp: new Date(dateKey).getTime(),
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            sodium: 0,
          };

          existing.calories += decrypted.totalCalories || 0;
          if (decrypted.items) {
            (decrypted.items as Array<{ protein?: number; carbs?: number; fat?: number; sodium?: number }>).forEach((item) => {
              existing.protein += item.protein || 0;
              existing.carbs += item.carbs || 0;
              existing.fat += item.fat || 0;
              existing.sodium = (existing.sodium || 0) + (item.sodium || 0);
            });
          }
          intakeByDay.set(dateKey, existing);
        }
        intakeDataPoints = Array.from(intakeByDay.values());
      } else {
        // Standard flow from local Dexie
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const localDecryptedLogs = await db.decryptedLogs
          .where('timestamp')
          .above(ninetyDaysAgo)
          .filter(log => log.userId === userId)
          .toArray();

        const intakeByDay = new Map<string, IntakePoint>();

        for (const log of localDecryptedLogs) {
          const dateKey = log.timestamp.toISOString().split('T')[0];
          const timestamp = new Date(dateKey).getTime();

          const existing = intakeByDay.get(dateKey) || {
            timestamp,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            sodium: 0,
          };

          existing.calories += log.totalCalories || 0;

          if (log.items) {
            (log.items as Array<{ protein?: number; carbs?: number; fat?: number; sodium?: number }>).forEach((item) => {
              existing.protein += item.protein || 0;
              existing.carbs += item.carbs || 0;
              existing.fat += item.fat || 0;
              existing.sodium = (existing.sodium || 0) + (item.sodium || 0);
            });
          }

          intakeByDay.set(dateKey, existing);
        }
        intakeDataPoints = Array.from(intakeByDay.values());
      }

      const targets: MacroTargets = raw.targets;

      // 3. Run coaching analysis in Web Worker
      const insights = await generateInsightsInWorker(
        weightData,
        intakeDataPoints,
        targets
      );

      // Calculate trend summary
      const trendSummary: TrendSummary = {
        dataQuality: {
          weightEntries: weightData.length,
          loggingDays: intakeDataPoints.length,
          hasEnoughData: weightData.length >= 3 && intakeDataPoints.length >= 3,
        },
        currentStatus: {
          avgCalories: intakeDataPoints.reduce((sum, d) => sum + d.calories, 0) / Math.max(1, intakeDataPoints.length),
          avgProtein: intakeDataPoints.reduce((sum, d) => sum + d.protein, 0) / Math.max(1, intakeDataPoints.length),
          currentWeight: weightData.length > 0 ? weightData[weightData.length - 1].weight : null,
        },
      };

      setData({
        insights,
        trendSummary,
        targets,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze coaching data');
    } finally {
      setLoading(false);
    }
  }, [userId, sharedVaultKey]);

  /**
   * Apply a coaching action (e.g., Update Target)
   */
  const applyAction = useCallback(async (action: CoachingAction) => {
    if (!userId) return;
    setIsApplyingAction(true);
    
    try {
      switch (action.type) {
        case 'UPDATE_TARGET':
          // Call API to update user targets
          const response = await fetch('/api/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          
          if (!response.ok) throw new Error('Failed to update target');
          
          // Refresh coaching data
          await fetchInsights();
          break;
          
        case 'LOG_WEIGHT':
          // Redirect or open weight logger
          console.log('Action: LOG_WEIGHT requested');
          break;
          
        default:
          console.log('Action not implemented:', action.type);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply action');
    } finally {
      setIsApplyingAction(false);
    }
  }, [userId, fetchInsights]);

  useEffect(() => {
    fetchInsights();

    if (autoRefresh) {
      const interval = setInterval(fetchInsights, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchInsights, autoRefresh, refreshInterval]);

  const refresh = useCallback(() => {
    fetchInsights();
  }, [fetchInsights]);

  return {
    data,
    loading,
    error,
    isApplyingAction,
    refresh,
    applyAction,
  };
}
