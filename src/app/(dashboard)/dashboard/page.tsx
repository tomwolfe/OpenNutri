'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UniversalEntry } from '@/components/universal-entry';
import { AiUsageTracker } from '@/components/ai-usage-tracker';
import { CoachingDashboard } from '@/components/coaching-dashboard';
import { DataExport } from '@/components/data-export';
import { WeightTracker } from '@/components/weight-tracker';
import { WeightChart } from '@/components/weight-chart';
import { OnboardingWizard } from '@/components/onboarding-wizard';
import { QuickWeightInput } from '@/components/quick-weight-input';
import { UnlockVault } from '@/components/unlock-vault';
import { useEncryption } from '@/hooks/useEncryption';
import { useDailyLogs } from '@/hooks/use-daily-logs';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import Image from 'next/image';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, LogOut, Plus, Utensils, Settings, Image as ImageIcon } from 'lucide-react';
import { EncryptedImage } from '@/components/encrypted-image';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const { vaultKey, isReady } = useEncryption();
  const router = useRouter();

  // State for selected date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // useDailyLogs Hook (reactive Dexie queries)
  const {
    logs: dailyLogs,
    dailyTotals,
    isLoading: loading,
    triggerSync,
    removeLog,
  } = useDailyLogs(selectedDate, session?.user?.id, vaultKey);

  const [snapDialogOpen, setSnapDialogOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Trigger background sync when authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id && vaultKey) {
      triggerSync(session.user.id, vaultKey).catch(console.error);
    }
  }, [status, session?.user?.id, vaultKey, triggerSync]);

  // Check if vault is unlocked (key loaded in memory)
  useEffect(() => {
    if (status === 'authenticated' && isReady) {
      if (vaultKey) {
        setIsUnlocked(true);
      }
    }
  }, [status, isReady, vaultKey]);

  // Check if user needs onboarding
  useEffect(() => {
    if (status === 'authenticated') {
      const checkOnboardingNeeded = async () => {
        try {
          const response = await fetch('/api/profile');
          if (response.ok) {
            const data = await response.json();
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
      checkOnboardingNeeded();
    }
  }, [status]);

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

  // Show unlock screen if authenticated but vault is locked
  if (status === 'authenticated' && isReady && !isUnlocked) {
    return <UnlockVault onUnlocked={() => setIsUnlocked(true)} onError={setUnlockError} />;
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  const getMealLogs = (mealType: string) => {
    return dailyLogs.filter((log) => log.mealType === mealType);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Daily Summary - {selectedDate.toLocaleDateString()}
                </CardTitle>
                {selectedDate.toDateString() === new Date().toDateString() && (
                  <QuickWeightInput />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-500">
                      {dailyTotals.calories}
                    </div>
                    <div className="text-sm text-muted-foreground">Calories</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-500">
                      {Math.round(dailyTotals.protein)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Protein</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-500">
                      {Math.round(dailyTotals.carbs)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Carbs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-500">
                      {Math.round(dailyTotals.fat)}g
                    </div>
                    <div className="text-sm text-muted-foreground">Fat</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WeightTracker />

              <div className="pb-2 border-b">
                <AiUsageTracker />
              </div>

              {/* Universal Entry */}
              <Dialog open={snapDialogOpen} onOpenChange={setSnapDialogOpen}>
                <DialogTrigger render={
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Food
                  </Button>
                } />
                <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>Log Food</DialogTitle>
                    <CardDescription>
                      Snap a photo, scan a barcode, or search for food.
                    </CardDescription>
                  </DialogHeader>
                  <UniversalEntry
                    onComplete={() => {
                      setTimeout(() => setSnapDialogOpen(false), 2000);
                    }}
                  />
                </DialogContent>
              </Dialog>
              
              <div className="flex justify-end pt-2">
                <DataExport />
              </div>
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
                    {mealLogs.length} entries &bull;{' '}
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
                                <div className="relative h-12 w-12 overflow-hidden rounded-md border bg-gray-100 flex items-center justify-center">
                                  {log.imageIv ? (
                                    <EncryptedImage
                                      imageUrl={log.imageUrl}
                                      imageIv={log.imageIv}
                                      alt="Meal photo"
                                      fill
                                      className="object-cover"
                                      sizes="48px"
                                    />
                                  ) : (
                                    <Image
                                      src={log.imageUrl}
                                      alt="Meal photo"
                                      fill
                                      className="object-cover"
                                      sizes="48px"
                                    />
                                  )}
                                </div>
                              )}
                              {!log.imageUrl && (
                                <div className="h-12 w-12 flex items-center justify-center bg-gray-50 rounded-md border border-dashed text-gray-300">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {log.items.map((item, idx) => (
                              <div
                                key={`${log.id}-item-${idx}`}
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
