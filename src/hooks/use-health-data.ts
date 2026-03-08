'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { db, type LocalHealthData } from '@/lib/db-local';
import { useLiveQuery } from 'dexie-react-hooks';

/**
 * useHealthData Hook
 * 
 * Manages integration with browser-based health APIs.
 * Supports Apple Health (via PWA shortcut) and manual activity tracking.
 * Caches data locally in Dexie for TDEE calculations.
 */
export function useHealthData(date: Date) {
  const { data: session } = useSession();
  const dateStr = date.toISOString().split('T')[0];
  const [isSyncing, setIsSyncing] = useState(false);

  // Live query for today's health data
  const healthData = useLiveQuery(
    async () => {
      if (!session?.user?.id) return null;
      return await db.healthData.get([session.user.id, dateStr]);
    },
    [session?.user?.id, dateStr]
  );

  /**
   * Sync from Web Health API (Experimental)
   * Note: On iOS, this requires the app to be 'Installed' as a PWA
   * and uses the experimental 'Web Health' or 'Health Connect' polyfills.
   */
  const syncHealthData = useCallback(async () => {
    if (!session?.user?.id) return;
    
    setIsSyncing(true);
    try {
      // Mocking the Health API for now as it requires specific PWA permissions
      // In a real implementation, we would check window.HealthConnect or similar.
      console.log('Syncing health data for', dateStr);
      
      // Simulate a small delay
      await new Promise(resolve => setTimeout(resolve, 800));

      // Example mock data (would be replaced by actual API call)
      const mockData: LocalHealthData = {
        userId: session.user.id,
        date: dateStr,
        steps: 8500,
        activeCalories: 350, // This is the 'Active Energy Burned'
        source: 'apple_health',
        updatedAt: Date.now(),
      };

      await db.healthData.put(mockData);
    } catch (err) {
      console.error('Failed to sync health data', err);
    } finally {
      setIsSyncing(false);
    }
  }, [session?.user?.id, dateStr]);

  /**
   * Manually record activity
   */
  const recordManualActivity = useCallback(async (activeCalories: number, steps?: number) => {
    if (!session?.user?.id) return;

    await db.healthData.put({
      userId: session.user.id,
      date: dateStr,
      steps,
      activeCalories,
      source: 'manual',
      updatedAt: Date.now(),
    });
  }, [session?.user?.id, dateStr]);

  return {
    healthData,
    isSyncing,
    syncHealthData,
    recordManualActivity,
  };
}
