'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface SyncConflict {
  type: 'log' | 'target';
  id: string;
  localVersion: number;
  serverVersion: number;
  localData?: {
    foodName?: string;
    calories?: number;
    timestamp?: string;
    mealType?: string;
    updatedAt?: number;
  };
  serverData?: {
    foodName?: string;
    calories?: number;
    timestamp?: string;
    mealType?: string;
    updatedAt?: number;
  };
}

interface SyncConflictModalProps {
  open: boolean;
  conflicts: SyncConflict[];
  onResolve: (resolution: 'keep-local' | 'keep-server' | 'keep-newest') => Promise<void>;
  onCancel: () => void;
}

export function SyncConflictModal({
  open,
  conflicts,
  onResolve,
  onCancel,
}: SyncConflictModalProps) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (resolution: 'keep-local' | 'keep-server' | 'keep-newest') => {
    setResolving(true);
    try {
      await onResolve(resolution);
    } finally {
      setResolving(false);
    }
  };

  const formatTimestamp = (timestamp?: number | string) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getConflictSummary = (conflict: SyncConflict) => {
    if (conflict.type === 'log') {
      const localName = conflict.localData?.foodName || 'Unknown food';
      return {
        title: `Food Log: "${localName}"`,
        description: `Modified on ${formatTimestamp(conflict.localData?.updatedAt)} (you) vs ${formatTimestamp(conflict.serverData?.updatedAt)} (another device)`,
      };
    }
    return {
      title: `Target Update`,
      description: `Modified on ${formatTimestamp(conflict.localData?.updatedAt)} (you) vs ${formatTimestamp(conflict.serverData?.updatedAt)} (another device)`,
    };
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync Conflicts Detected</DialogTitle>
          <DialogDescription>
            {conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'} found between this device and the cloud.
            <br />
            This happens when the same data is modified on multiple devices at the same time.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto space-y-4 py-4">
          {conflicts.map((conflict, index) => {
            const summary = getConflictSummary(conflict);
            return (
              <Card key={`${conflict.type}-${conflict.id}-${index}`}>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{conflict.type === 'log' ? 'Food Log' : 'Target'}</Badge>
                      <span className="text-sm font-medium">{summary.title}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <div className="font-medium text-primary">Your Version</div>
                        <div className="text-muted-foreground">
                          {conflict.localData?.foodName && (
                            <div>Food: {conflict.localData.foodName}</div>
                          )}
                          {conflict.localData?.calories && (
                            <div>Calories: {conflict.localData.calories}</div>
                          )}
                          {conflict.localData?.mealType && (
                            <div>Meal: {conflict.localData.mealType}</div>
                          )}
                          <div>Modified: {formatTimestamp(conflict.localData?.updatedAt)}</div>
                          <div>Version: {conflict.localVersion}</div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium text-primary">Cloud Version</div>
                        <div className="text-muted-foreground">
                          {conflict.serverData?.foodName && (
                            <div>Food: {conflict.serverData.foodName}</div>
                          )}
                          {conflict.serverData?.calories && (
                            <div>Calories: {conflict.serverData.calories}</div>
                          )}
                          {conflict.serverData?.mealType && (
                            <div>Meal: {conflict.serverData.mealType}</div>
                          )}
                          <div>Modified: {formatTimestamp(conflict.serverData?.updatedAt)}</div>
                          <div>Version: {conflict.serverVersion}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleResolve('keep-newest')}
            disabled={resolving}
          >
            Keep Newest (Automatic)
          </Button>
          <Button
            variant="outline"
            onClick={() => handleResolve('keep-server')}
            disabled={resolving}
          >
            Keep Cloud Version
          </Button>
          <Button
            variant="outline"
            onClick={() => handleResolve('keep-local')}
            disabled={resolving}
          >
            Keep My Version
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={resolving}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
