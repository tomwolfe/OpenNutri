/**
 * useAiUsage Hook
 *
 * Fetches and tracks the user's daily AI scan usage.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AiUsageData {
  used: number;
  remaining: number;
  dailyLimit: number;
  resetAt: string;
}

/**
 * Hook to fetch AI scan usage
 */
export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/usage');
      if (!response.ok) {
        throw new Error('Failed to fetch usage');
      }
      const data = await response.json();
      setUsage(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchUsage();
  }, [fetchUsage]);

  return {
    usage,
    loading,
    error,
    refresh,
  };
}
