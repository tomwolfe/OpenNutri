'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db-local';
import { syncDelta } from '@/lib/sync-engine';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useEncryption } from '@/hooks/useEncryption';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon,
  Database,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function SyncStatusCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  
  const { vaultKey } = useEncryption();
  const { syncQueue } = useOfflineQueue();

  // Reactive queries for pending items
  const pendingLogsCount = useLiveQuery(
    () => db.foodLogs.where('synced').equals(0).count()
  ) ?? 0;

  const pendingTargetsCount = useLiveQuery(
    () => db.userTargets.where('synced').equals(0).count()
  ) ?? 0;

  const pendingImagesCount = useLiveQuery(
    () => db.pendingImages.count()
  ) ?? 0;

  const lastSyncTime = typeof window !== 'undefined' 
    ? parseInt(localStorage.getItem('opennutri_last_sync') || '0') 
    : 0;

  const totalPending = pendingLogsCount + pendingTargetsCount;

  const handleSync = async () => {
    setIsSyncing(true);
    setLastError(null);
    try {
      // 1. Sync data (logs/targets)
      // syncDelta already handles auth check on server side
      
      const result = await syncDelta('', vaultKey); // userId can be empty string as server uses session.user.id
      
      // 2. Sync images
      await syncQueue();

      if (!result.success) {
        setLastError('Data sync failed. Check your connection.');
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Sync Health
        </CardTitle>
        <CardDescription>
          Status of your local-first data and cloud backups
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
            <div className={`p-2 rounded-full ${totalPending > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
              {totalPending > 0 ? (
                <CloudOff className="h-4 w-4 text-amber-600" />
              ) : (
                <Cloud className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pending Data</div>
              <div className="text-lg font-semibold">{totalPending}</div>
            </div>
          </div>
          
          <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
            <div className={`p-2 rounded-full ${pendingImagesCount > 0 ? 'bg-blue-100' : 'bg-green-100'}`}>
              {pendingImagesCount > 0 ? (
                <ImageIcon className="h-4 w-4 text-blue-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pending Images</div>
              <div className="text-lg font-semibold">{pendingImagesCount}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm py-2 border-t border-b">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Last Synced</span>
          </div>
          <span className="font-medium">
            {lastSyncTime > 0 
              ? formatDistanceToNow(lastSyncTime, { addSuffix: true })
              : 'Never'
            }
          </span>
        </div>

        {lastError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{lastError}</span>
          </div>
        )}

        <Button 
          onClick={handleSync} 
          disabled={isSyncing} 
          className="w-full"
          variant={totalPending > 0 || pendingImagesCount > 0 ? 'default' : 'outline'}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync Now
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
