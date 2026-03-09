'use client';

import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Scale, TrendingUp, TrendingDown, Minus, Loader2, Trash2 } from 'lucide-react';
import { db } from '@/lib/db-local';

interface UserTarget {
  userId: string;
  date: string;
  weightRecord: number | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbTarget: number | null;
  fatTarget: number | null;
  highSodium?: boolean;
  highCarbs?: boolean;
}

export function WeightTracker() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [highSodium, setHighSodium] = useState(false);
  const [highCarbs, setHighCarbs] = useState(false);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reactive local query replaces manual fetch
  const weightHistory = useLiveQuery(
    async () => {
      if (!session?.user?.id) return [];
      return await db.userTargets
        .where('userId')
        .equals(session.user.id)
        .filter(t => t.weightRecord !== null)
        .toArray();
    },
    [session?.user?.id]
  ) || [];

  // Derived state for the UI
  const sortedHistory = [...weightHistory].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const latestWeight = sortedHistory.length > 0
    ? sortedHistory[sortedHistory.length - 1]
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const weightValue = parseFloat(weight);
      if (isNaN(weightValue) || weightValue <= 0 || weightValue > 500) {
        throw new Error('Please enter a valid weight between 0 and 500');
      }

      const dateStr = date.toISOString().split('T')[0];

      const response = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          weightRecord: weightValue,
          highSodium,
          highCarbs,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save weight');
      }

      setSuccess(true);
      setWeight('');
      setHighSodium(false);
      setHighCarbs(false);

      // Close dialog after success
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save weight');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (dateStr: string) => {
    if (!confirm('Delete this weight entry?')) return;

    try {
      const response = await fetch(`/api/targets?date=${dateStr}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete entry');
      }
      // No need to manually refresh - useLiveQuery will update automatically
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const getWeightChange = () => {
    if (sortedHistory.length < 2) return null;

    const latest = sortedHistory[sortedHistory.length - 1];
    const previous = sortedHistory[sortedHistory.length - 2];
    const change = (latest.weightRecord ?? 0) - (previous.weightRecord ?? 0);

    return {
      value: Math.abs(change).toFixed(1),
      isIncrease: change > 0,
      isDecrease: change < 0,
    };
  };

  const weightChange = getWeightChange();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <div onClick={() => setOpen(true)}>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Weight Tracker
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestWeight ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold">{latestWeight.weightRecord!.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">kg</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(latestWeight.date).toLocaleDateString()}
                </div>
                {weightChange && (
                  <div className={`flex items-center gap-1 text-xs ${
                    weightChange.isIncrease ? 'text-red-500' :
                    weightChange.isDecrease ? 'text-green-500' : 'text-muted-foreground'
                  }`}>
                    {weightChange.isIncrease ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : weightChange.isDecrease ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                    <span>
                      {weightChange.isIncrease ? '+' : weightChange.isDecrease ? '-' : ''}{weightChange.value} kg
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No weight recorded yet
              </p>
            )}
          </CardContent>
        </Card>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Track Your Weight</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Weight History Summary */}
          {sortedHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {sortedHistory.slice(-5).reverse().map((entry) => (
                    <div
                      key={entry.date}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {(entry.highSodium || entry.highCarbs) && (
                          <div className="flex gap-1">
                            {entry.highSodium && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">Na</span>}
                            {entry.highCarbs && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">CHO</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.weightRecord!.toFixed(1)} kg</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(entry.date)}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add Weight Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date.toISOString().split('T')[0]}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(new Date(e.target.value + 'T00:00:00'));
                  }
                }}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                min="0"
                max="500"
                placeholder="e.g., 70.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="highSodium" 
                  checked={highSodium} 
                  onCheckedChange={(checked) => setHighSodium(!!checked)} 
                />
                <Label htmlFor="highSodium" className="text-xs">High Sodium</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="highCarbs" 
                  checked={highCarbs} 
                  onCheckedChange={(checked) => setHighCarbs(!!checked)} 
                />
                <Label htmlFor="highCarbs" className="text-xs">High Carbs</Label>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md bg-green-100 p-3 text-sm text-green-700">
                Weight saved successfully!
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Scale className="mr-2 h-4 w-4" />
                  Save Weight
                </>
              )}
            </Button>
          </form>

          <div className="text-xs text-muted-foreground text-center">
            <p>Track your weight daily for better insights and coaching recommendations.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
