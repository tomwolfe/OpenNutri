/**
 * Health Data Integration API
 *
 * Provides unified interface for syncing health data from:
 * - Apple HealthKit (iOS PWA with native bridge)
 * - Google Fit (Android via OAuth REST API)
 *
 * All health data is processed client-side and never sent to the server.
 * Data is cached in Dexie IndexedDB for offline access and TDEE calculations.
 */

import { db, type LocalHealthData } from './db-local';

export interface HealthDataSync {
  steps?: number;
  activeCalories?: number;
  distanceMeters?: number;
  heartRateAvg?: number;
  source: 'apple_health' | 'google_fit' | 'manual';
}

/**
 * Apple HealthKit Types
 */
interface HealthKitSample {
  uuid: string;
  value: number;
  startDate: string;
  endDate: string;
  metadata?: Record<string, unknown>;
}

interface HealthKitQueryOptions {
  type: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
}

/**
 * Google Fit Types
 */
interface GoogleFitDataset {
  dataSourceId: string;
  point: Array<{
    startTimeNanos: string;
    endTimeNanos: string;
    value: Array<{ intVal?: number; fpVal?: number }>;
  }>;
}

/**
 * Check if Apple HealthKit is available (iOS PWA)
 */
export async function isAppleHealthAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  // Check for HealthKit bridge (requires PWA installation on iOS)
  // This uses the experimental Web Health API or a native bridge
  const win = window as unknown as {
    HealthKit?: {
      querySampleType: (options: HealthKitQueryOptions) => Promise<HealthKitSample[]>;
      isAvailable: () => Promise<boolean>;
    };
    webkit?: {
      messageHandlers?: {
        healthkit?: {
          postMessage: (message: unknown) => Promise<{ value: unknown }>;
        };
      };
    };
  };

  if (win.HealthKit) {
    try {
      const available = await win.HealthKit.isAvailable();
      return available;
    } catch {
      return false;
    }
  }

  // Fallback: Check for WebKit message handler (custom native bridge)
  return !!(win.webkit?.messageHandlers?.healthkit);
}

/**
 * Check if Google Fit is available (Android)
 */
export async function isGoogleFitAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  // Check for Google Sign-In or Fitness API
  const win = window as unknown as {
    google?: {
      fit?: {
        requestAuthorization: (scopes: { scopes: string[] }) => Promise<void>;
      };
      auth2?: {
        getAuthInstance: () => {
          isSignedIn: { get: () => boolean };
          currentUser: { get: { getBasicProfile: () => { getId: () => string } } };
        };
      };
    };
    fitness?: {
      isAvailable: () => Promise<boolean>;
    };
  };

  return !!(win.google?.fit || win.fitness);
}

/**
 * Sync Apple HealthKit data for a specific date
 * Queries: Steps, Active Energy, Distance, Heart Rate
 */
export async function syncAppleHealthData(date: string): Promise<HealthDataSync> {
  const win = window as unknown as {
    HealthKit?: {
      querySampleType: (options: HealthKitQueryOptions) => Promise<HealthKitSample[]>;
    };
    webkit?: {
      messageHandlers?: {
        healthkit?: {
          postMessage: (message: { type: string; params: unknown }) => Promise<{ value: unknown }>;
        };
      };
    };
  };

  const startDate = new Date(date + 'T00:00:00');
  const endDate = new Date(date + 'T23:59:59');

  const result: HealthDataSync = { source: 'apple_health' };

  try {
    // Query Steps
    if (win.HealthKit?.querySampleType) {
      const steps = await win.HealthKit.querySampleType({
        type: 'HKQuantityTypeIdentifierStepCount',
        startDate,
        endDate,
      });
      result.steps = steps.reduce((sum, s) => sum + s.value, 0);
    } else if (win.webkit?.messageHandlers?.healthkit) {
      // Fallback to WebKit bridge
      const stepsResponse = await win.webkit.messageHandlers.healthkit.postMessage({
        type: 'querySampleType',
        params: {
          type: 'HKQuantityTypeIdentifierStepCount',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      const stepsData = stepsResponse.value as HealthKitSample[];
      result.steps = stepsData.reduce((sum, s) => sum + s.value, 0);
    }

    // Query Active Energy (calories)
    if (win.HealthKit?.querySampleType) {
      const energy = await win.HealthKit.querySampleType({
        type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        startDate,
        endDate,
      });
      result.activeCalories = energy.reduce((sum, s) => sum + s.value, 0);
    } else if (win.webkit?.messageHandlers?.healthkit) {
      const energyResponse = await win.webkit.messageHandlers.healthkit.postMessage({
        type: 'querySampleType',
        params: {
          type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      const energyData = energyResponse.value as HealthKitSample[];
      result.activeCalories = energyData.reduce((sum, s) => sum + s.value, 0);
    }

    // Query Distance
    if (win.HealthKit?.querySampleType) {
      const distance = await win.HealthKit.querySampleType({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        startDate,
        endDate,
      });
      result.distanceMeters = distance.reduce((sum, s) => sum + s.value, 0) * 1000; // Convert km to meters
    }

    return result;
  } catch (error) {
    console.error('Failed to sync Apple Health data:', error);
    throw new Error('Apple Health sync failed');
  }
}

/**
 * Sync Google Fit data for a specific date
 * Uses Google Fit REST API with OAuth2 token
 */
export async function syncGoogleFitData(
  date: string,
  accessToken: string
): Promise<HealthDataSync> {
  const baseUrl = 'https://www.googleapis.com/fitness/v1/users/me/dataset/aggregate';
  
  const startTimeMillis = new Date(date + 'T00:00:00').getTime();
  const endTimeMillis = new Date(date + 'T23:59:59').getTime();

  const result: HealthDataSync = { source: 'google_fit' };

  try {
    // Aggregate multiple data sources in one request
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startTimeMillis: startTimeMillis.toString(),
        endTimeMillis: endTimeMillis.toString(),
        bucketByTime: { durationMillis: (endTimeMillis - startTimeMillis).toString() },
        aggregateBy: [
          { dataTypeName: 'com.google.step_count.delta' },
          { dataTypeName: 'com.google.calories.expended' },
          { dataTypeName: 'com.google.distance.delta' },
          { dataTypeName: 'com.google.heart_rate.bpm' },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google Fit authorization failed');
      }
      throw new Error(`Google Fit API error: ${response.statusText}`);
    }

    const data = await response.json() as { bucket: Array<{ dataset: GoogleFitDataset[] }> };

    if (data.bucket && data.bucket.length > 0) {
      const datasets = data.bucket[0].dataset;

      for (const dataset of datasets) {
        const dataSourceId = dataset.dataSourceId;
        
        for (const point of dataset.point) {
          const value = point.value[0];
          if (!value) continue;

          if (dataSourceId.includes('step_count')) {
            result.steps = (result.steps || 0) + (value.intVal || 0);
          } else if (dataSourceId.includes('calories')) {
            result.activeCalories = (result.activeCalories || 0) + (value.fpVal || value.intVal || 0);
          } else if (dataSourceId.includes('distance')) {
            result.distanceMeters = (result.distanceMeters || 0) + (value.intVal || 0);
          } else if (dataSourceId.includes('heart_rate')) {
            result.heartRateAvg = (value.fpVal || value.intVal || 0);
          }
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to sync Google Fit data:', error);
    throw new Error('Google Fit sync failed');
  }
}

/**
 * Save health data to local Dexie database
 */
export async function saveHealthDataLocally(
  userId: string,
  date: string,
  data: HealthDataSync
): Promise<void> {
  await db.healthData.put({
    userId,
    date,
    steps: data.steps,
    activeCalories: data.activeCalories,
    source: data.source,
    updatedAt: Date.now(),
  });
}

/**
 * Get health data for a specific date from local cache
 */
export async function getHealthDataForDate(
  userId: string,
  date: string
): Promise<LocalHealthData | null> {
  const data = await db.healthData.get([userId, date]);
  return data ?? null;
}

/**
 * Get health data for a date range
 */
export async function getHealthDataForRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<LocalHealthData[]> {
  const allData = await db.healthData
    .where('[userId+date]')
    .between([userId, startDate], [userId, endDate], true, true)
    .toArray();

  return allData;
}

/**
 * Clear old health data (cleanup)
 */
export async function cleanupOldHealthData(
  userId: string,
  daysToKeep: number = 90
): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const oldData = await db.healthData
    .where('[userId+date]')
    .below([userId, cutoffStr])
    .toArray();

  for (const item of oldData) {
    await db.healthData.delete([userId, item.date]);
  }
}
