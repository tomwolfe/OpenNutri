/**
 * useJobStatus Hook
 *
 * Client-side polling hook for AI job status.
 * Polls the job status endpoint until job is completed or failed.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobStatusData {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
  imageUrl?: string;
  foodLog?: {
    id: string;
    totalCalories: number;
    aiConfidenceScore: number;
    mealType: string;
    isVerified: boolean;
    items: Array<{
      foodName: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      source: string;
    }>;
  };
  error?: string;
}

export interface UseJobStatusOptions {
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Stop polling after this many milliseconds (default: 120000 = 2 min) */
  timeout?: number;
  /** Callback when job completes */
  onComplete?: (data: JobStatusData) => void;
  /** Callback when job fails */
  onError?: (error: string) => void;
}

/**
 * Hook to poll AI job status
 * @param jobId - The job ID to poll (null to disable)
 * @param options - Polling options
 */
export function useJobStatus(
  jobId: string | null,
  options: UseJobStatusOptions = {}
) {
  const {
    pollInterval = 2000,
    timeout = 120000,
    onComplete,
    onError,
  } = options;

  const [data, setData] = useState<JobStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const fetchStatus = useCallback(async () => {
    if (!jobId) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/jobs/${jobId}/status`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch status');
      }

      const result: JobStatusData = await response.json();
      setData(result);

      // Check if job is terminal (completed or failed)
      if (result.status === 'completed') {
        stopPolling();
        onComplete?.(result);
      } else if (result.status === 'failed') {
        stopPolling();
        onError?.(result.error || 'Job failed');
      } else {
        // Continue polling if within timeout
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed < timeout) {
          pollTimeoutRef.current = setTimeout(fetchStatus, pollInterval);
        } else {
          stopPolling();
          setError('Polling timeout. Job still processing.');
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch job status';
      setError(errorMessage);
      stopPolling();
    } finally {
      setIsLoading(false);
    }
  }, [jobId, pollInterval, timeout, onComplete, onError]);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Start polling when jobId changes
  useEffect(() => {
    if (jobId) {
      startTimeRef.current = Date.now();
      fetchStatus();
    }

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (jobId && !isLoading) {
      startTimeRef.current = Date.now();
      fetchStatus();
    }
  }, [jobId, isLoading, fetchStatus]);

  // Stop polling function exposed to caller
  const cancel = useCallback(() => {
    stopPolling();
  }, [stopPolling]);

  return {
    data,
    isLoading,
    error,
    refresh,
    cancel,
    isPolling: pollTimeoutRef.current !== null,
  };
}
