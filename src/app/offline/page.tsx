'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Home, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Back Online!</CardTitle>
            <CardDescription>Redirecting you to the dashboard...</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Card className="max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
              <WifiOff className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">You&apos;re Offline</CardTitle>
          <CardDescription className="text-base">
            Don&apos;t worry! OpenNutri works offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-center">Available Offline:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                View your food logs and nutrition data
              </li>
              <li className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Log meals manually or with AI (on-device)
              </li>
              <li className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Track your weight
              </li>
              <li className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                View coaching insights
              </li>
              <li className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-amber-600">
                  USDA search requires internet connection
                </span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 text-center">
              <strong>Local-First:</strong> Your data is stored on your device and syncs automatically when you&apos;re back online.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full"
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="w-full"
            >
              <Utensils className="h-4 w-4 mr-2" />
              Log a Meal
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Check your connection and refresh to sync
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
