/**
 * Quick Weight Input Component
 *
 * Inline weight entry without opening a dialog.
 * Saves on blur or Enter key press.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Scale, Check, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickWeightInputProps {
  /** Callback when weight is saved successfully */
  onWeightSaved?: (weight: number, date: string) => void;
  /** Initial weight value if exists for today */
  todayWeight?: number | null;
}

export function QuickWeightInput({ onWeightSaved, todayWeight }: QuickWeightInputProps) {
  const [weight, setWeight] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedWeightRef = useRef<number | null>(null);

  // Reset when todayWeight changes (e.g., date changed)
  useEffect(() => {
    if (todayWeight !== null && todayWeight !== undefined) {
      setWeight(todayWeight.toString());
    } else {
      setWeight('');
    }
    setSaved(false);
    setError(null);
    setIsPending(false);
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, [todayWeight]);

  const executeActualSave = useCallback(async (weightValue: number) => {
    setIsSaving(true);
    setIsPending(false);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];

      const response = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          weightRecord: weightValue,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save weight');
      }

      setSaved(true);
      lastSavedWeightRef.current = weightValue;
      onWeightSaved?.(weightValue, today);

      // Reset success state after delay
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaved(false);
    } finally {
      setIsSaving(false);
    }
  }, [onWeightSaved]);

  const initiateSave = useCallback((weightValue: number) => {
    if (isNaN(weightValue) || weightValue <= 0 || weightValue > 500) {
      setError('Invalid weight');
      return;
    }

    // Don't save if it's the same as what we just saved or what's currently there
    if (weightValue === todayWeight || weightValue === lastSavedWeightRef.current) {
      return;
    }

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
    }

    setIsPending(true);
    setError(null);
    setSaved(false);

    pendingTimerRef.current = setTimeout(() => {
      executeActualSave(weightValue);
      pendingTimerRef.current = null;
    }, 3000);
  }, [todayWeight, executeActualSave]);

  const handleUndo = () => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setIsPending(false);
    // Optionally revert the weight input if the user wants it back to original
    if (todayWeight !== null && todayWeight !== undefined) {
      setWeight(todayWeight.toString());
    }
  };

  const handleBlur = () => {
    if (weight && !isSaving && !isPending) {
      const weightValue = parseFloat(weight);
      initiateSave(weightValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (weight && !isSaving) {
        const weightValue = parseFloat(weight);
        initiateSave(weightValue);
      }
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2 relative">
        <div className="relative flex-1">
          <Scale className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            step="0.1"
            min="0"
            max="500"
            placeholder="Quick weight (kg)"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setError(null);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isSaving || isPending}
            className={`pl-8 pr-8 ${isPending ? 'border-orange-400 focus-visible:ring-orange-400 animate-pulse' : ''}`}
          />
          {isSaving && (
            <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {saved && !isSaving && (
            <Check className="absolute right-2 top-2.5 h-4 w-4 text-green-600" />
          )}
        </div>

        {isPending ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleUndo}
            className="shrink-0 flex items-center gap-1 h-9"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
        ) : (
          weight && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const weightValue = parseFloat(weight);
                initiateSave(weightValue);
              }}
              disabled={isSaving || !weight}
              className="shrink-0 h-9"
            >
              Save
            </Button>
          )
        )}
      </div>
      
      <div className="min-h-[1rem]">
        {error && (
          <p className="text-[10px] text-destructive leading-none">{error}</p>
        )}
        {isPending && !error && (
          <p className="text-[10px] text-orange-600 font-medium leading-none animate-in fade-in slide-in-from-top-1">
            Saving in 3s...
          </p>
        )}
      </div>
    </div>
  );
}
