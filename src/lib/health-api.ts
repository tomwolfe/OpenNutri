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

/**
 * PKCE Helper: Generate a random code verifier
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return arrayBufferToBase64Url(array);
}

/**
 * PKCE Helper: Generate a code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64Url(new Uint8Array(digest));
}

/**
 * Helper: Convert ArrayBuffer to Base64Url (no padding, URL safe)
 */
function arrayBufferToBase64Url(buffer: Uint8Array): string {
  const binString = Array.from(buffer)
    .map((b) => String.fromCharCode(b))
    .join('');
  const base64 = btoa(binString);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Google Fit OAuth 2.0 Configuration
 */
const GOOGLE_FIT_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_FIT_CLIENT_ID || '',
  redirectUri: typeof window !== 'undefined' ? window.location.origin + '/auth/google-fit/callback' : '',
  scopes: [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.body.read',
  ],
};

/**
 * Get Google Fit access token from sessionStorage or initiate OAuth flow
 * Returns null if not authenticated or if OAuth flow needs to be initiated
 */
export async function getGoogleFitAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  // Check sessionStorage for existing token
  const stored = sessionStorage.getItem('google_fit_access_token');
  const expiresAt = sessionStorage.getItem('google_fit_expires_at');

  if (stored && expiresAt) {
    const expiryTime = parseInt(expiresAt, 10);
    const now = Date.now();

    // Token is still valid (with 5 minute buffer)
    if (now < expiryTime - 5 * 60 * 1000) {
      return stored;
    }

    // Token is expired, remove it
    sessionStorage.removeItem('google_fit_access_token');
    sessionStorage.removeItem('google_fit_expires_at');
  }

  // No valid token found - initiate OAuth flow
  const token = await initiateGoogleFitOAuth();
  return token;
}

/**
 * Initiate Google Fit OAuth 2.0 authorization flow
 * Opens Google OAuth popup and handles the authorization response
 */
export async function initiateGoogleFitOAuth(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!GOOGLE_FIT_CONFIG.clientId) {
    console.error('Google Fit Client ID not configured');
    return null;
  }

  // Task 5.2: Use PKCE for secure OAuth
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('google_fit_code_verifier', verifier);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_FIT_CONFIG.clientId);
  authUrl.searchParams.set('redirect_uri', GOOGLE_FIT_CONFIG.redirectUri);
  authUrl.searchParams.set('response_type', 'code'); // PKCE uses 'code'
  authUrl.searchParams.set('scope', GOOGLE_FIT_CONFIG.scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', crypto.randomUUID());

  return new Promise((resolve) => {
    const popupWidth = 500;
    const popupHeight = 600;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;

    const popup = window.open(
      authUrl.toString(),
      'Google Fit OAuth',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`
    );

    if (!popup) {
      console.error('Failed to open OAuth popup - popup blocker may be enabled');
      resolve(null);
      return;
    }

    // Listen for message from popup callback
    const handleMessage = async (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'GOOGLE_FIT_OAUTH_CODE') {
        const { code } = event.data.payload;
        const storedVerifier = sessionStorage.getItem('google_fit_code_verifier');

        try {
          // Exchange code for token using our server-side proxy
          const response = await fetch('/api/auth/google-fit/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              code_verifier: storedVerifier,
            }),
          });

          if (!response.ok) throw new Error('Token exchange failed');

          const { access_token, expires_in } = await response.json();

          // Store token in sessionStorage
          sessionStorage.setItem('google_fit_access_token', access_token);
          sessionStorage.setItem('google_fit_expires_at', (Date.now() + expires_in * 1000).toString());

          resolve(access_token);
        } catch (err) {
          console.error('Google Fit token exchange error:', err);
          resolve(null);
        }
      } else if (event.data.type === 'GOOGLE_FIT_OAUTH_ERROR') {
        console.error('Google Fit OAuth error:', event.data.error);
        resolve(null);
      }

      window.removeEventListener('message', handleMessage);
      popup.close();
      sessionStorage.removeItem('google_fit_code_verifier');
    };

    window.addEventListener('message', handleMessage);

    // Check if popup was closed without completing
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        resolve(null);
      }
    }, 500);
  });
}

/**
 * Revoke Google Fit access token and clear stored credentials
 */
export async function revokeGoogleFitAccessToken(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const token = sessionStorage.getItem('google_fit_access_token');

  if (token) {
    try {
      // Revoke token with Google
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to revoke Google Fit token:', error);
    }

    // Clear stored tokens
    sessionStorage.removeItem('google_fit_access_token');
    sessionStorage.removeItem('google_fit_expires_at');
  }
}

/**
 * Check if user is authenticated with Google Fit
 */
export function isGoogleFitAuthenticated(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const token = sessionStorage.getItem('google_fit_access_token');
  const expiresAt = sessionStorage.getItem('google_fit_expires_at');

  if (!token || !expiresAt) return false;

  const expiryTime = parseInt(expiresAt, 10);
  const now = Date.now();

  return now < expiryTime - 5 * 60 * 1000;
}
