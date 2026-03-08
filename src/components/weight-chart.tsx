'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';

interface WeightEntry {
  date: string;
  weight: number;
}

interface WeightChartProps {
  days?: number;
  height?: number;
}

export function WeightChart({ days = 30, height = 200 }: WeightChartProps) {
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWeightHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/targets');
      const data = await response.json();

      if (data.targets) {
        const weights = data.targets
          .filter((t: { weightRecord: number | null }) => t.weightRecord !== null)
          .map((t: { date: string; weightRecord: number }) => ({
            date: t.date,
            weight: t.weightRecord,
          }))
          .sort((a: WeightEntry, b: WeightEntry) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );

        // Filter to last N days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const filtered = weights.filter(
          (entry: WeightEntry) => new Date(entry.date) >= cutoffDate
        );

        setWeightHistory(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch weight history:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchWeightHistory();
  }, [fetchWeightHistory]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weight Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (weightHistory.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weight Trend</CardTitle>
          <CardDescription>No weight data recorded</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <p>Start tracking your weight to see trends</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate chart data
  const weights = weightHistory.map((entry) => entry.weight);
  const minWeight = Math.min(...weights) - 0.5;
  const maxWeight = Math.max(...weights) + 0.5;
  const range = maxWeight - minWeight || 1;

  // Calculate trend
  const isIncreasing = weights[weights.length - 1] > weights[0];
  const totalChange = weights[weights.length - 1] - weights[0];

  // Generate SVG path
  const width = 100;
  const padding = 5;
  const chartHeight = height - padding * 2;

  const points = weightHistory.map((entry, index) => {
    const x = padding + (index / (weightHistory.length - 1 || 1)) * (width - padding * 2);
    const y = padding + chartHeight - ((entry.weight - minWeight) / range) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  // Generate date labels
  const dateLabels = weightHistory.filter((_, index) => {
    const step = Math.ceil(weightHistory.length / 5);
    return index % step === 0 || index === weightHistory.length - 1;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Weight Trend</CardTitle>
            <CardDescription>
              Last {days} days • {weightHistory.length} entries
            </CardDescription>
          </div>
          <div className={`flex items-center gap-1 text-sm ${
            isIncreasing ? 'text-red-500' : 'text-green-500'
          }`}>
            {isIncreasing ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span className="font-medium">
              {isIncreasing ? '+' : ''}{totalChange.toFixed(1)} kg
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={padding}
                y1={padding + chartHeight * ratio}
                x2={width - padding}
                y2={padding + chartHeight * ratio}
                stroke="hsl(var(--border))"
                strokeWidth="0.5"
              />
            ))}

            {/* Area fill */}
            <defs>
              <linearGradient id="weightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#weightGradient)" />

            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {points.map((point, index) => {
              const [cx, cy] = point.split(',').map(Number);
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r="1.5"
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--primary))"
                  strokeWidth="1"
                />
              );
            })}
          </svg>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-full flex-col justify-between text-xs text-muted-foreground">
            <span>{maxWeight.toFixed(1)}</span>
            <span>{((maxWeight + minWeight) / 2).toFixed(1)}</span>
            <span>{minWeight.toFixed(1)}</span>
          </div>

          {/* X-axis labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground px-2">
            {dateLabels.map((entry) => (
              <span key={entry.date}>
                {new Date(entry.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
