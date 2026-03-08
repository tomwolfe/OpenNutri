/**
 * Hook for managing offline image upload queue
 *
 * Provides methods to:
 * - Queue images when offline
 * - Sync pending images when online
 * - Track sync progress and pending count
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  addToOfflineQueue,
  getPendingImages,
  removeFromQueue,
  getPendingCount,
  blobToFile,
  isIndexedDBAvailable,
} from '@/lib/offline-queue';

interface UseOfflineQueueReturn {
  /** Whether IndexedDB is available */
  isAvailable: boolean;
  /** Number of pending images in queue */
  pendingCount: number;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Add image to queue */
  queueImage: (file: File, mealType: string) => Promise<string | null>;
  /** Sync all pending images */
  syncQueue: () => Promise<{ success: number; failed: number }>;
  /** Refresh pending count */
  refreshCount: () => Promise<void>;
}

/**
 * Upload image to blob storage
 */
async function uploadToBlob(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/api/blob/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  const data = await response.json();
  return data.imageUrl;
}

/**
 * Analyze uploaded image
 */
async function analyzeImage(imageUrl: string, mealType: string): Promise<void> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageUrl,
      mealTypeHint: mealType,
    }),
  });

  if (!response.ok) {
    throw new Error('Analysis failed');
  }
}

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [isAvailable] = useState(() => isIndexedDBAvailable());
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  /**
   * Queue an image for later upload
   * Returns the queue ID if successful, null if IndexedDB unavailable
   */
  const queueImage = useCallback(
    async (file: File, mealType: string): Promise<string | null> => {
      if (!isAvailable) {
        console.warn('IndexedDB not available, cannot queue image');
        return null;
      }

      try {
        const id = await addToOfflineQueue(file, file.name, mealType);
        console.log(`Image queued for offline upload: ${id}`);
        return id;
      } catch (error) {
        console.error('Failed to queue image:', error);
        return null;
      }
    },
    [isAvailable]
  );

  /**
   * Sync all pending images to the server
   */
  const syncQueue = useCallback(async (): Promise<{ success: number; failed: number }> => {
    if (!isAvailable) {
      return { success: 0, failed: 0 };
    }

    setIsSyncing(true);

    try {
      const pendingImages = await getPendingImages();
      let success = 0;
      let failed = 0;

      for (const pending of pendingImages) {
        try {
          // Skip if too many retries (prevent infinite loops)
          if (pending.retryCount >= 3) {
            console.warn(`Skipping image ${pending.id} after ${pending.retryCount} retries`);
            await removeFromQueue(pending.id);
            failed++;
            continue;
          }

          // Convert blob to file
          const file = blobToFile(pending.file, pending.fileName);

          // Upload to blob storage
          const imageUrl = await uploadToBlob(file);

          // Analyze the image
          await analyzeImage(imageUrl, pending.mealType);

          // Remove from queue on success
          await removeFromQueue(pending.id);
          success++;

          console.log(`Successfully synced image ${pending.id}`);
        } catch (error) {
          console.error(`Failed to sync image ${pending.id}:`, error);
          // Increment retry count for failed uploads
          await incrementRetryCount(pending.id);
          failed++;
        }
      }

      return { success, failed };
    } catch (error) {
      console.error('Sync queue error:', error);
      return { success: 0, failed: 0 };
    } finally {
      setIsSyncing(false);
      // Refresh count after sync
      refreshCount();
    }
  }, [isAvailable]);

  /**
   * Refresh the pending count
   */
  const refreshCount = useCallback(async () => {
    if (!isAvailable) return;

    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (error) {
      console.error('Failed to refresh pending count:', error);
    }
  }, [isAvailable]);

  // Auto-sync when coming online
  useEffect(() => {
    if (!isAvailable) return;

    const handleOnline = async () => {
      console.log('Network online, syncing pending images...');
      await syncQueue();
    };

    window.addEventListener('online', handleOnline);

    // Check for pending images on mount
    refreshCount();

    // Clean up old pending images periodically
    const cleanupInterval = setInterval(async () => {
      const { clearOldPendingImages } = await import('@/lib/offline-queue');
      const deleted = await clearOldPendingImages(24);
      if (deleted > 0) {
        console.log(`Cleaned up ${deleted} old pending images`);
        refreshCount();
      }
    }, 60 * 60 * 1000); // Every hour

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(cleanupInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAvailable, syncQueue]);

  return {
    isAvailable,
    pendingCount,
    isSyncing,
    queueImage,
    syncQueue,
    refreshCount,
  };
}

// Import incrementRetryCount for syncQueue
async function incrementRetryCount(id: string): Promise<number> {
  const { incrementRetryCount: inc } = await import('@/lib/offline-queue');
  return inc(id);
}
