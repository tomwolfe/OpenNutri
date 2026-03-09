'use client';

import { useCoaching } from '@/hooks/useCoaching';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Target, Scale, Utensils, Dumbbell, Zap, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { CoachingAction } from '@/lib/coaching/linear-regression';

interface CoachingCardProps {
  title: React.ReactNode;
  description: string;
  trend?: 'increasing' | 'decreasing' | 'stable';
  confidence?: number;
  explanation?: string;
  children?: React.ReactNode;
}

function CoachingCard({ title, description, trend, confidence = 0, explanation, children }: CoachingCardProps) {
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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {trend && (
            <div className={cn('flex items-center gap-1', trendColor)}>
              <TrendIcon className="w-4 h-4" />
              <span className="text-xs font-medium capitalize">{trend}</span>
            </div>
          )}
        </div>
        {confidence > 0 && (
          <div className="mt-1">
            <Badge variant="secondary" className={cn('text-[10px] h-4', confidenceColor)}>
              Confidence: {Math.round(confidence * 100)}%
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{description}</p>
        {explanation && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800 font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {explanation}
            </p>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function InsightIcon({ type }: { type: string }) {
  const icons: Record<string, React.ElementType> = {
    calorie: Utensils,
    protein: Dumbbell,
    carbs: Target,
    fat: Scale,
    weight: Scale,
    consistency: Zap,
  };
  const Icon = icons[type] || Target;
  return <Icon className="h-5 w-5" />;
}

interface CoachingDashboardProps {
  userId?: string;
  sharedVaultKey?: CryptoKey | null;
  isSharedView?: boolean;
}

export function CoachingDashboard({ userId, sharedVaultKey, isSharedView: _isSharedView }: CoachingDashboardProps) {
  const { data: session } = useSession();
  const effectiveUserId = userId || session?.user?.id;
  
  const { data, loading, error, refresh, applyAction, isApplyingAction } = useCoaching({
    userId: effectiveUserId,
    sharedVaultKey: sharedVaultKey,
  });
  const [lastActionId, setLastActionId] = useState<string | null>(null);

  const handleApplyAction = async (insightId: string, action: CoachingAction) => {
    setLastActionId(insightId);
    await applyAction(action);
    setLastActionId(null);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coaching Insights</CardTitle>
          <CardDescription>Analyzing your progress...</CardDescription>
        </CardHeader>
        <CardContent className="h-40 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-2">
            <div className="h-4 w-48 bg-gray-200 rounded"></div>
            <div className="h-3 w-32 bg-gray-100 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-100 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">Coaching Error</CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
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
        <CardContent className="py-12 flex flex-col items-center text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-medium mb-2">Not enough data yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            We need at least 3 days of logging to provide 
            personalized coaching insights. Keep tracking your meals and weight!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            AI Coaching <Badge variant="outline" className="text-blue-600 border-blue-200">BETA</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">Smart adjustments for your goals</p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="text-xs text-blue-600">
          Refresh Analysis
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.insights.map((insight) => (
          <CoachingCard
            key={insight.id}
            title={
              <div className="flex items-center gap-2">
                <InsightIcon type={insight.type} />
                <span className="capitalize">{insight.type}</span>
              </div>
            }
            description={insight.recommendation}
            trend={insight.trend}
            confidence={insight.confidence}
            explanation={insight.explanation}
          >
            {/* Visual Progress for Macros */}
            {(insight.type === 'calorie' || insight.type === 'protein') && data.targets && (
              <div className="mb-4">
                <div className="flex justify-between text-[10px] mb-1">
                  <span>Current Avg: {Math.round(insight.type === 'calorie' ? data.trendSummary.currentStatus.avgCalories : data.trendSummary.currentStatus.avgProtein)}</span>
                  <span>Target: {insight.type === 'calorie' ? data.targets.calories : data.targets.protein}</span>
                </div>
                <Progress
                  value={((insight.type === 'calorie' ? data.trendSummary.currentStatus.avgCalories : data.trendSummary.currentStatus.avgProtein) / (insight.type === 'calorie' ? data.targets.calories : data.targets.protein)) * 100}
                  className="h-1.5"
                />
              </div>
            )}

            {/* Actionable Button */}
            {insight.action && (
              <div className="pt-2 border-t mt-2">
                <Button
                  size="sm"
                  variant={insight.type === 'calorie' || insight.type === 'protein' ? 'default' : 'outline'}
                  className="w-full h-9 gap-2 shadow-sm"
                  disabled={isApplyingAction}
                  onClick={() => handleApplyAction(insight.id, insight.action!)}
                >
                  {isApplyingAction && lastActionId === insight.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {insight.action.label}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-2 text-center italic">
                  {insight.action.description}
                </p>
              </div>
            )}
          </CoachingCard>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Logging Days" value={data.trendSummary.dataQuality.loggingDays} unit="days" />
        <StatCard label="Avg Calories" value={Math.round(data.trendSummary.currentStatus.avgCalories)} unit="cal" />
        <StatCard label="Current Weight" value={data.trendSummary.currentStatus.currentWeight?.toFixed(1) || '—'} unit="kg" />
        <StatCard label="Streak" value={data.insights.find(i => i.id.includes('streak'))?.dataPoints || 0} unit="days" highlight />
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, highlight }: { label: string, value: string | number, unit: string, highlight?: boolean }) {
  return (
    <Card className={cn("p-3 flex flex-col items-center justify-center text-center", highlight && "bg-blue-50 border-blue-100")}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold flex items-baseline gap-0.5">
        {value} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
      </div>
    </Card>
  );
}
