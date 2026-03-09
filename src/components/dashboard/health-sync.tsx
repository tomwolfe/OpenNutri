/**
 * Health Sync Component
 *
 * Displays and syncs health data from Apple Health or Google Fit.
 * Shows steps, active calories, and allows manual entry.
 */

'use client';

import { useState, useCallback } from 'react';
import { Activity, Flame, Footprints, RefreshCw, Plus, TrendingUp } from 'lucide-react';
import { useHealthData } from '@/hooks/use-health-data';
import { cn } from '@/lib/utils';

interface HealthSyncProps {
  date?: Date;
  onSyncComplete?: (data: { steps?: number; activeCalories?: number }) => void;
}

export function HealthSync({ date = new Date(), onSyncComplete }: HealthSyncProps) {
  const {
    healthData,
    isSyncing,
    syncError,
    availableSources,
    syncHealthData,
    syncFromPlatform,
    recordManualActivity,
  } = useHealthData(date);

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualSteps, setManualSteps] = useState('');
  const [manualCalories, setManualCalories] = useState('');

  const handleSync = useCallback(async () => {
    const result = await syncHealthData();
    if (result) {
      onSyncComplete?.(result);
    }
  }, [syncHealthData, onSyncComplete]);

  const handleManualSubmit = useCallback(async () => {
    const steps = manualSteps ? parseInt(manualSteps, 10) : undefined;
    const calories = manualCalories ? parseInt(manualCalories, 10) : undefined;

    if (!steps && !calories) return;

    await recordManualActivity(calories || 0, steps);
    setShowManualEntry(false);
    setManualSteps('');
    setManualCalories('');
  }, [manualSteps, manualCalories, recordManualActivity]);

  const steps = healthData?.steps || 0;
  const activeCalories = healthData?.activeCalories || 0;

  // Goal thresholds (can be customized)
  const stepsGoal = 10000;
  const caloriesGoal = 500;

  const stepsProgress = Math.min((steps / stepsGoal) * 100, 100);
  const caloriesProgress = Math.min((activeCalories / caloriesGoal) * 100, 100);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Activity Tracking</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {availableSources.length > 0 && (
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-full disabled:opacity-50"
              title="Sync health data"
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
            </button>
          )}
          
          <button
            type="button"
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-full"
            title="Manual entry"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sync Error */}
      {syncError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {syncError}
        </div>
      )}

      {/* Manual Entry Form */}
      {showManualEntry && (
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <h4 className="font-medium text-gray-900">Manual Activity Entry</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Steps</label>
              <input
                type="number"
                value={manualSteps}
                onChange={(e) => setManualSteps(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1">Active Calories</label>
              <input
                type="number"
                value={manualCalories}
                onChange={(e) => setManualCalories(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleManualSubmit}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowManualEntry(false)}
              className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Steps */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Steps</span>
          </div>
          
          <div className="text-2xl font-bold text-blue-900">
            {steps.toLocaleString()}
          </div>
          
          <div className="mt-2">
            <div className="flex justify-between text-xs text-blue-700 mb-1">
              <span>{Math.round(stepsProgress)}%</span>
              <span>of {stepsGoal.toLocaleString()}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${stepsProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Calories */}
        <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-medium text-orange-900">Active Cal</span>
          </div>
          
          <div className="text-2xl font-bold text-orange-900">
            {activeCalories.toLocaleString()}
          </div>
          
          <div className="mt-2">
            <div className="flex justify-between text-xs text-orange-700 mb-1">
              <span>{Math.round(caloriesProgress)}%</span>
              <span>of {caloriesGoal.toLocaleString()}</span>
            </div>
            <div className="w-full bg-orange-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all"
                style={{ width: `${caloriesProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Source Indicator */}
      {healthData && (
        <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
          <TrendingUp className="w-3 h-3" />
          <span>
            {healthData.source === 'apple_health' && 'Synced from Apple Health'}
            {healthData.source === 'google_fit' && 'Synced from Google Fit'}
            {healthData.source === 'manual' && 'Manually entered'}
          </span>
        </div>
      )}

      {/* Platform Availability */}
      {availableSources.length === 0 && !healthData && (
        <div className="text-center text-sm text-gray-500 py-2">
          No health platform available. Use manual entry to track activity.
        </div>
      )}

      {/* Platform-specific sync buttons (if multiple available) */}
      {availableSources.length > 1 && (
        <div className="flex gap-2">
          {availableSources.includes('apple_health') && (
            <button
              type="button"
              onClick={() => syncFromPlatform('apple_health')}
              disabled={isSyncing}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm disabled:opacity-50"
            >
              Sync Apple Health
            </button>
          )}
          
          {availableSources.includes('google_fit') && (
            <button
              type="button"
              onClick={() => syncFromPlatform('google_fit')}
              disabled={isSyncing}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm disabled:opacity-50"
            >
              Sync Google Fit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
