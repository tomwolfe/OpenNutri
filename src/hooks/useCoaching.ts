/**
 * useCoaching Hook
 *
 * Fetches and manages coaching insights with client-side analysis for privacy.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  generateCoachingInsights, 
  type CoachingInsight, 
  type IntakePoint,
  type MacroTargets 
} from '@/lib/coaching';

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
  /** Encryption helper (to decrypt historical logs) */
  decryptLog?: (data: string, iv: string) => Promise<any>;
  /** Whether encryption is ready */
  isEncryptionReady?: boolean;
}

/**
 * Hook to fetch coaching insights with local analysis for privacy
 */
export function useCoaching(options: UseCoachingOptions = {}) {
  const { 
    refreshInterval = 60000, 
    autoRefresh = true,
    decryptLog,
    isEncryptionReady
  } = options;

  const [data, setData] = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch raw data for local analysis
      const response = await fetch('/api/coaching/data');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch coaching data');
      }

      const raw = await response.json();
      const weightData = raw.weightRecords
        .filter((r: any) => r.weight !== null)
        .map((r: any) => ({
          timestamp: new Date(r.date).getTime(),
          weight: Number(r.weight),
        }));

      // Process and decrypt intake data
      const intakeByDay = new Map<string, IntakePoint>();

      for (const log of raw.intakeLogs) {
        const dateKey = new Date(log.timestamp).toISOString().split('T')[0];
        const timestamp = new Date(dateKey).getTime();

        let logCalories = Number(log.totalCalories) || 0;
        let logProtein = 0, logCarbs = 0, logFat = 0;

        // Decrypt for full macro data if possible
        if (isEncryptionReady && decryptLog && log.encryptedData && log.encryptionIv) {
          try {
            const decrypted: any = await decryptLog(log.encryptedData, log.encryptionIv);
            const items = Array.isArray(decrypted) ? decrypted : (decrypted.items || [decrypted]);

            logCalories = items.reduce((sum: number, i: any) => sum + (i.calories || 0), 0);
            logProtein = items.reduce((sum: number, i: any) => sum + (i.protein || 0), 0);
            logCarbs = items.reduce((sum: number, i: any) => sum + (i.carbs || 0), 0);
            logFat = items.reduce((sum: number, i: any) => sum + (i.fat || 0), 0);
          } catch (err) {
            console.warn('Coaching: Failed to decrypt log', log.id);
          }
        }

        const existing = intakeByDay.get(dateKey) || {
          timestamp,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };

        existing.calories += logCalories;
        existing.protein += logProtein;
        existing.carbs += logCarbs;
        existing.fat += logFat;
        intakeByDay.set(dateKey, existing);
      }

      const intakeDataPoints = Array.from(intakeByDay.values());
      const targets: MacroTargets = raw.targets;

      // Run local coaching analysis
      const insights = generateCoachingInsights(
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
  }, [decryptLog, isEncryptionReady]);

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
    refresh,
  };
}
