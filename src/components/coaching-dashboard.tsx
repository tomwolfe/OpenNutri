'use client';

import { useCoaching } from '@/hooks/useCoaching';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertCircle, 
  CheckCircle,
  Target,
  Scale,
  Utensils,
  Dumbbell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CoachingCardProps {
  title: React.ReactNode;
  description: string;
  trend?: 'increasing' | 'decreasing' | 'stable';
  confidence?: number;
  children?: React.ReactNode;
}

function CoachingCard({
  title,
  description,
  trend,
  confidence = 0,
  children
}: CoachingCardProps) {
  const TrendIcon = {
    increasing: TrendingUp,
    decreasing: TrendingDown,
    stable: Minus,
  }[trend || 'stable'];

  const trendColor = {
    increasing: 'text-orange-500',
    decreasing: 'text-blue-500',
    stable: 'text-green-500',
  }[trend || 'stable'];

  const confidenceColor = confidence >= 0.7
    ? 'bg-green-100 text-green-700'
    : confidence >= 0.4
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-700';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {trend && (
            <div className={cn('flex items-center gap-1', trendColor)}>
              <TrendIcon />
              <span className="text-xs font-medium capitalize">{trend}</span>
            </div>
          )}
        </div>
        {confidence > 0 && (
          <CardDescription>
            <Badge variant="secondary" className={cn('text-xs', confidenceColor)}>
              Confidence: {Math.round(confidence * 100)}%
            </Badge>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

interface InsightIconProps {
  type: 'calorie' | 'protein' | 'carbs' | 'fat' | 'weight';
}

function InsightIcon({ type }: InsightIconProps) {
  const icons = {
    calorie: Utensils,
    protein: Dumbbell,
    carbs: Target,
    fat: Scale,
    weight: Scale,
  };

  const Icon = icons[type];

  return <Icon className="h-5 w-5" />;
}

export function CoachingDashboard() {
  const { data, loading, error, refresh } = useCoaching();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coaching Insights</CardTitle>
          <CardDescription>Analyzing your progress...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center">
            <div className="text-sm text-muted-foreground">
              Loading insights...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coaching Insights</CardTitle>
          <CardDescription>Unable to load insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.insights || data.insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coaching Insights</CardTitle>
          <CardDescription>Personalized recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Not enough data yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              We need at least 3 days of weight and food logging to provide 
              personalized coaching insights. Keep tracking your meals and weight!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Coaching Insights</h2>
          <p className="text-sm text-muted-foreground">
            AI-powered recommendations based on your progress
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-sm text-primary hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Data Quality Indicator */}
      {data.trendSummary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Data Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {data.trendSummary.dataQuality.weightEntries}
                </div>
                <div className="text-xs text-muted-foreground">Weight Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {data.trendSummary.dataQuality.loggingDays}
                </div>
                <div className="text-xs text-muted-foreground">Logging Days</div>
              </div>
              <div className="text-center">
                <Badge
                  variant={
                    data.trendSummary.dataQuality.hasEnoughData
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {data.trendSummary.dataQuality.hasEnoughData
                    ? 'Ready'
                    : 'Need More'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.insights.map((insight, index) => (
          <CoachingCard
            key={index}
            title={
              <div className="flex items-center gap-2">
                <InsightIcon type={insight.type} />
                <span className="capitalize">{insight.type}</span>
              </div>
            }
            description={insight.recommendation}
            trend={insight.trend}
            confidence={insight.confidence}
          >
            {insight.type === 'calorie' && data.targets && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Avg: {Math.round(data.trendSummary.currentStatus.avgCalories)} cal</span>
                  <span>Target: {data.targets.calories} cal</span>
                </div>
                <Progress
                  value={(data.trendSummary.currentStatus.avgCalories / data.targets.calories) * 100}
                  className="h-2"
                />
              </div>
            )}

            {insight.type === 'protein' && data.targets && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Avg: {Math.round(data.trendSummary.currentStatus.avgProtein)}g</span>
                  <span>Target: {data.targets.protein}g</span>
                </div>
                <Progress
                  value={(data.trendSummary.currentStatus.avgProtein / data.targets.protein) * 100}
                  className="h-2"
                />
              </div>
            )}
          </CoachingCard>
        ))}
      </div>

      {/* Current Status Summary */}
      {data.trendSummary.currentStatus.currentWeight && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Current Weight</div>
                <div className="text-2xl font-bold">
                  {data.trendSummary.currentStatus.currentWeight.toFixed(1)} kg
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg Daily Intake</div>
                <div className="text-2xl font-bold">
                  {Math.round(data.trendSummary.currentStatus.avgCalories)} cal
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
