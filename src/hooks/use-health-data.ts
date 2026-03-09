'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { db } from '@/lib/db-local';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  isAppleHealthAvailable,
  isGoogleFitAvailable,
  syncAppleHealthData,
  syncGoogleFitData,
  saveHealthDataLocally,
  type HealthDataSync,
} from '@/lib/health-api';

/**
 * useHealthData Hook
 *
 * Manages integration with platform-specific health APIs:
 * - Apple HealthKit (iOS PWA with native bridge)
 * - Google Fit (Android via OAuth REST API)
 * - Manual entry fallback
 *
 * All data is cached locally in Dexie for offline access and TDEE calculations.
 * Health data is never sent to the server (privacy-first).
 */
export function useHealthData(date: Date) {
  const { data: session } = useSession();
  const dateStr = date.toISOString().split('T')[0];
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<Array<'apple_health' | 'google_fit'>>([]);

  // Live query for today's health data
  const healthData = useLiveQuery(
    async () => {
      if (!session?.user?.id) return null;
      return await db.healthData.get([session.user.id, dateStr]);
    },
    [session?.user?.id, dateStr]
  );

  // Detect available health platforms on mount
  useEffect(() => {
    const detectPlatforms = async () => {
      const sources: Array<'apple_health' | 'google_fit'> = [];
      
      const [appleAvailable, googleAvailable] = await Promise.all([
        isAppleHealthAvailable(),
        isGoogleFitAvailable(),
      ]);

      if (appleAvailable) sources.push('apple_health');
      if (googleAvailable) sources.push('google_fit');

      setAvailableSources(sources);
    };

    detectPlatforms();
  }, []);

  /**
   * Sync health data from available platform
   * Automatically detects and uses the best available source
   */
  const syncHealthData = useCallback(async (): Promise<HealthDataSync | null> => {
    if (!session?.user?.id) return null;

    setIsSyncing(true);
    setSyncError(null);

    try {
      let data: HealthDataSync | null = null;

      // Priority: Apple Health > Google Fit > Manual
      if (availableSources.includes('apple_health')) {
        try {
          data = await syncAppleHealthData(dateStr);
          console.log('Synced from Apple Health:', data);
        } catch (err) {
          console.warn('Apple Health sync failed, trying Google Fit:', err);
        }
      }

      if (!data && availableSources.includes('google_fit')) {
        try {
          // Get access token from session or prompt OAuth
          const accessToken = await getGoogleFitAccessToken();
          if (accessToken) {
            data = await syncGoogleFitData(dateStr, accessToken);
            console.log('Synced from Google Fit:', data);
          }
        } catch (err) {
          console.warn('Google Fit sync failed:', err);
        }
      }

      if (data) {
        await saveHealthDataLocally(session.user.id, dateStr, data);
        return data;
      } else {
        setSyncError('No health platform available. Please enter data manually.');
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setSyncError(errorMessage);
      console.error('Failed to sync health data:', err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [session?.user?.id, dateStr, availableSources]);

  /**
   * Sync from specific platform (user choice)
   */
  const syncFromPlatform = useCallback(async (
    platform: 'apple_health' | 'google_fit'
  ): Promise<HealthDataSync | null> => {
    if (!session?.user?.id) return null;

    setIsSyncing(true);
    setSyncError(null);

    try {
      let data: HealthDataSync;

      if (platform === 'apple_health') {
        data = await syncAppleHealthData(dateStr);
      } else {
        const accessToken = await getGoogleFitAccessToken();
        if (!accessToken) {
          throw new Error('Google Fit access token not available');
        }
        data = await syncGoogleFitData(dateStr, accessToken);
      }

      await saveHealthDataLocally(session.user.id, dateStr, data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setSyncError(errorMessage);
      console.error(`${platform} sync failed:`, err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [session?.user?.id, dateStr]);

  /**
   * Manually record activity
   */
  const recordManualActivity = useCallback(async (
    activeCalories: number,
    steps?: number,
    distanceMeters?: number
  ) => {
    if (!session?.user?.id) return;

    const manualData: HealthDataSync = {
      steps,
      activeCalories,
      distanceMeters,
      source: 'manual',
    };

    await saveHealthDataLocally(session.user.id, dateStr, manualData);
  }, [session?.user?.id, dateStr]);

  /**
   * Get historical health data
   */
  const getHistoricalData = useCallback(async (daysBack: number = 30) => {
    if (!session?.user?.id) return [];

    const { getHealthDataForRange } = await import('@/lib/health-api');
    const endDate = new Date(dateStr);
    const startDate = new Date(dateStr);
    startDate.setDate(startDate.getDate() - daysBack);

    return await getHealthDataForRange(
      session.user.id,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }, [session?.user?.id, dateStr]);

  return {
    healthData,
    isSyncing,
    syncError,
    availableSources,
    syncHealthData,
    syncFromPlatform,
    recordManualActivity,
    getHistoricalData,
  };
}

/**
 * Get Google Fit access token from session or initiate OAuth flow
 */
async function getGoogleFitAccessToken(): Promise<string | null> {
  // In a real implementation, this would:
  // 1. Check for existing token in session storage
  // 2. If expired, use refresh token to get new token
  // 3. If no refresh token, initiate OAuth flow
  
  // For now, check if token is stored in session
  const token = sessionStorage.getItem('google_fit_access_token');
  if (token) {
    return token;
  }

  // Initiate OAuth flow (would open popup)
  // This is a placeholder for the actual OAuth implementation
  console.log('Google Fit OAuth required - implement OAuth popup flow');
  return null;
}
