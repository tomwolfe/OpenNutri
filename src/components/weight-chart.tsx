'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db-local';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Info, Droplets } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WeightChartProps {
  days?: number;
  height?: number;
}

export function WeightChart({ days = 30, height = 200 }: WeightChartProps) {
  const weightHistory = useLiveQuery(
    async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      return await db.userTargets
        .where('date')
        .aboveOrEqual(cutoffStr)
        .toArray();
    },
    [days]
  );

  const loading = weightHistory === undefined;

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

  const validEntries = (weightHistory || [])
    .filter(t => t.weightRecord !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (validEntries.length === 0) {
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
  const weights = validEntries.map((entry) => entry.weightRecord as number);
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

  const points = validEntries.map((entry, index) => {
    const x = padding + (index / (validEntries.length - 1 || 1)) * (width - padding * 2);
    const y = padding + chartHeight - (((entry.weightRecord as number) - minWeight) / range) * chartHeight;
    return { x, y, entry };
  });

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const areaD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              Weight Trend
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    Weight fluctuates based on hydration, salt, and carbs. Look at the long-term trend!
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Last {days} days • {validEntries.length} entries
            </CardDescription>
          </div>
          <div className={`flex items-center gap-1 text-sm ${
            isIncreasing ? 'text-orange-500' : 'text-green-500'
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
                strokeWidth="0.2"
              />
            ))}

            <defs>
              <linearGradient id="weightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#weightGradient)" />

            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points with metabolic markers */}
            {points.map((p, index) => {
              const isHighRetention = p.entry.highSodium || p.entry.highCarbs || p.entry.waterRetentionLikely;
              
              return (
                <g key={index}>
                  {isHighRetention && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="3"
                      fill="hsl(var(--primary))"
                      fillOpacity="0.15"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="1.2"
                    fill={isHighRetention ? "hsl(var(--primary))" : "hsl(var(--background))"}
                    stroke="hsl(var(--primary))"
                    strokeWidth="0.8"
                  />
                </g>
              );
            })}
          </svg>

          {/* Markers Legend */}
          <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full border border-primary bg-background" />
              <span>Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary/30" />
              <Droplets className="h-3 w-3 text-blue-500" />
              <span>Likely Water Retention (High Salt/Carbs)</span>
            </div>
          </div>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-full flex-col justify-between text-[10px] text-muted-foreground">
            <span>{maxWeight.toFixed(1)}</span>
            <span>{minWeight.toFixed(1)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
