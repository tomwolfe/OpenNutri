'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ManualFoodEntryForm } from '@/components/forms/manual-food-entry';
import { SnapToLog } from '@/components/snap-to-log';
import { AiUsageTracker } from '@/components/ai-usage-tracker';
import { CoachingDashboard } from '@/components/coaching-dashboard';
import { DataExport } from '@/components/data-export';
import { WeightTracker } from '@/components/weight-tracker';
import { WeightChart } from '@/components/weight-chart';
import { OnboardingWizard } from '@/components/onboarding-wizard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Image from 'next/image';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, LogOut, Plus, Utensils, Camera, Settings } from 'lucide-react';

interface LogItem {
  id: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}

interface FoodLog {
  id: string;
  mealType: string;
  totalCalories: number;
  aiConfidenceScore: number;
  isVerified: boolean;
  timestamp: string;
  imageUrl?: string | null;
  items: LogItem[];
}

interface DailyLogs {
  date: string;
  logs: FoodLog[];
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [logs, setLogs] = useState<DailyLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMealType, setSelectedMealType] = useState<string>('breakfast');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [snapDialogOpen, setSnapDialogOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetch(`/api/log/daily?date=${dateStr}`);
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Check if user needs onboarding
  useEffect(() => {
    if (status === 'authenticated') {
      checkOnboardingNeeded();
    }
  }, [status]);

  const checkOnboardingNeeded = async () => {
    try {
      const response = await fetch('/api/profile');
      if (response.ok) {
        const data = await response.json();
        // Show onboarding if profile is incomplete (missing key fields)
        const needsOnboarding =
          !data.profile?.birthDate ||
          !data.profile?.gender ||
          !data.profile?.heightCm ||
          !data.profile?.activityLevel;
        setShowOnboarding(needsOnboarding);
      }
    } catch (error) {
      console.error('Failed to check onboarding:', error);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchLogs();
    }
  }, [status, fetchLogs]);

  if (status === 'loading' || checkingOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  // Show onboarding wizard if needed
  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  const getMealLogs = (mealType: string) => {
    return logs?.logs.filter((log) => log.mealType === mealType) || [];
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSnapComplete = () => {
    // Refresh logs to show new entry
    fetchLogs();
    // Close dialog after short delay
    setTimeout(() => setSnapDialogOpen(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Utensils className="h-6 w-6" />
            <h1 className="text-xl font-bold">OpenNutri</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <span className="text-sm text-muted-foreground">
              {session?.user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Date Selector & Daily Summary */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Calendar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          {/* Daily Totals */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Daily Summary - {selectedDate.toLocaleDateString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : logs ? (
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-500">
                      {logs.dailyTotals.calories}
                    </div>
                    <div className="text-sm text-muted-foreground">Calories</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-500">
                      {Math.round(logs.dailyTotals.protein)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Protein</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-500">
                      {Math.round(logs.dailyTotals.carbs)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Carbs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-500">
                      {Math.round(logs.dailyTotals.fat)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Fat</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  No data for this date
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Weight Tracker */}
              <WeightTracker />

              {/* AI Usage Tracker */}
              <div className="pb-2 border-b">
                <AiUsageTracker />
              </div>

              {/* Data Export */}
              <div className="flex justify-end pb-2 border-b">
                <DataExport />
              </div>

              {/* Snap to Log */}
              <Dialog open={snapDialogOpen} onOpenChange={setSnapDialogOpen}>
                <DialogTrigger>
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    <Camera className="mr-2 h-4 w-4" />
                    Snap to Log
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Snap to Log</DialogTitle>
                  </DialogHeader>
                  <SnapToLog
                    onComplete={handleSnapComplete}
                    onError={(error) => console.error('Snap error:', error)}
                  />
                </DialogContent>
              </Dialog>

              {/* Manual Entry */}
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger>
                  <Button className="w-full" variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Food Manually
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Food to {selectedMealType}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Select
                      value={selectedMealType}
                      onValueChange={(value) => value && setSelectedMealType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select meal type" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ManualFoodEntryForm
                      mealType={selectedMealType}
                      onEntryComplete={() => {
                        setAddDialogOpen(false);
                        fetchLogs();
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>

        {/* Meal Sections */}
        <div className="grid gap-6 md:grid-cols-2">
          {MEAL_TYPES.map((mealType) => {
            const mealLogs = getMealLogs(mealType);
            return (
              <Card key={mealType}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg capitalize">
                    {mealType}
                  </CardTitle>
                  <CardDescription>
                    {mealLogs.length} entries •{' '}
                    {mealLogs.reduce((sum, log) => sum + (log.totalCalories || 0), 0)} cal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex h-24 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : mealLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No foods logged for {mealType}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {mealLogs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded-md border p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatTime(log.timestamp)}
                            </span>
                            <div className="flex items-center gap-2">
                              {log.isVerified && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                  Verified
                                </span>
                              )}
                              {log.imageUrl && (
                                <div className="relative h-12 w-12 overflow-hidden rounded-md border bg-gray-100">
                                  <Image
                                    src={log.imageUrl}
                                    alt="Meal photo"
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {log.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between text-sm"
                              >
                                <span>{item.foodName}</span>
                                <span className="font-medium">
                                  {item.calories} cal
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Weight Chart Section */}
        <div className="mt-8">
          <WeightChart days={30} />
        </div>

        {/* Coaching Insights Section */}
        <div className="mt-8">
          <CoachingDashboard />
        </div>
      </main>
    </div>
  );
}
