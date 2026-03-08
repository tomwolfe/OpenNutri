/**
 * Quick Weight Input Component
 *
 * Inline weight entry without opening a dialog.
 * Saves on blur or Enter key press.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Scale, Check, Loader2 } from 'lucide-react';
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when todayWeight changes (e.g., date changed)
  useEffect(() => {
    if (todayWeight !== null && todayWeight !== undefined) {
      setWeight(todayWeight.toString());
    } else {
      setWeight('');
    }
    setSaved(false);
    setError(null);
  }, [todayWeight]);

  const saveWeight = useCallback(async (weightValue: number) => {
    if (isNaN(weightValue) || weightValue <= 0 || weightValue > 500) {
      setError('Invalid weight');
      return;
    }

    setIsSaving(true);
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

  const handleBlur = () => {
    if (weight && !isSaving) {
      const weightValue = parseFloat(weight);
      if (weightValue !== todayWeight) {
        saveWeight(weightValue);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (weight && !isSaving) {
        const weightValue = parseFloat(weight);
        saveWeight(weightValue);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
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
          disabled={isSaving}
          className="pl-8 pr-8"
        />
        {isSaving && (
          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {saved && !isSaving && (
          <Check className="absolute right-2 top-2.5 h-4 w-4 text-green-600" />
        )}
      </div>
      {weight && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const weightValue = parseFloat(weight);
            saveWeight(weightValue);
          }}
          disabled={isSaving || !weight}
          className="shrink-0"
        >
          Save
        </Button>
      )}
      {error && (
        <p className="text-xs text-destructive absolute -bottom-4 left-0">{error}</p>
      )}
    </div>
  );
}
