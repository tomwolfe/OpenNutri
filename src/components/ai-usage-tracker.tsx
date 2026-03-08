/**
 * AI Usage Tracker Component
 *
 * Displays daily AI scan usage with progress bar.
 */

'use client';

import { useAiUsage } from '@/hooks/useAiUsage';
import { Loader2 } from 'lucide-react';

export function AiUsageTracker() {
  const { usage, loading, error } = useAiUsage();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading usage...</span>
      </div>
    );
  }

  if (error || !usage) {
    return null;
  }

  const percentage = (usage.used / usage.dailyLimit) * 100;
  const isNearLimit = usage.remaining <= 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">AI Scans Today</span>
        <span className={isNearLimit ? 'text-red-600' : 'text-muted-foreground'}>
          {usage.used} / {usage.dailyLimit}
          {usage.remaining === 0 && ' (Limit reached)'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`absolute left-0 top-0 h-full transition-all ${
            isNearLimit ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Reset time */}
      <p className="text-xs text-muted-foreground">
        Resets at {new Date(usage.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>

      {/* Warning message */}
      {isNearLimit && usage.remaining > 0 && (
        <p className="text-xs text-red-600">
          {usage.remaining} scan{usage.remaining > 1 ? 's' : ''} remaining today
        </p>
      )}
    </div>
  );
}
