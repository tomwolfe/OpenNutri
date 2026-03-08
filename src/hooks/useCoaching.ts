/**
 * useCoaching Hook
 *
 * Fetches and manages coaching insights from the API.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CoachingInsight } from '@/lib/coaching';

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
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    weightGoal: 'lose' | 'maintain' | 'gain';
  };
}

export interface UseCoachingOptions {
  /** Auto-refresh interval in milliseconds (default: 60000 = 1 min) */
  refreshInterval?: number;
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
}

/**
 * Hook to fetch coaching insights
 */
export function useCoaching(options: UseCoachingOptions = {}) {
  const { refreshInterval = 60000, autoRefresh = true } = options;

  const [data, setData] = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/coaching/insights');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch insights');
      }

      const result: CoachingData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  }, []);

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
