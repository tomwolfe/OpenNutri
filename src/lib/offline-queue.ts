/**
 * IndexedDB Offline Queue for Food Images
 *
 * Migrated to Dexie.js for better performance and reactivity.
 * Stores food images locally when offline and syncs when connection is restored.
 */

import { db, type PendingImage } from './db-local';

/**
 * Add an image to the offline queue
 */
export async function addToOfflineQueue(
  file: Blob,
  fileName: string,
  mealType: string
): Promise<string> {
  const id = crypto.randomUUID();

  const pendingImage: PendingImage = {
    id,
    file,
    fileName,
    fileType: file.type,
    fileSize: file.size,
    mealType,
    timestamp: Date.now(),
    retryCount: 0,
  };

  await db.pendingImages.add(pendingImage);
  return id;
}

/**
 * Get all pending images from the queue
 */
export async function getPendingImages(): Promise<PendingImage[]> {
  return db.pendingImages.orderBy('timestamp').toArray();
}

/**
 * Remove an image from the queue after successful upload
 */
export async function removeFromQueue(id: string): Promise<void> {
  await db.pendingImages.delete(id);
}

/**
 * Increment retry count for a failed upload
 */
export async function incrementRetryCount(id: string): Promise<number> {
  const item = await db.pendingImages.get(id);
  if (item) {
    const newRetryCount = item.retryCount + 1;
    await db.pendingImages.update(id, { retryCount: newRetryCount });
    return newRetryCount;
  }
  return 0;
}

/**
 * Clear old pending images (older than 24 hours)
 */
export async function clearOldPendingImages(maxAgeHours = 24): Promise<number> {
  const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
  
  const oldImages = await db.pendingImages
    .where('timestamp')
    .below(cutoffTime)
    .toArray();
    
  if (oldImages.length > 0) {
    await db.pendingImages.bulkDelete(oldImages.map(img => img.id));
  }
  
  return oldImages.length;
}

/**
 * Get the count of pending images
 */
export async function getPendingCount(): Promise<number> {
  return db.pendingImages.count();
}

/**
 * Convert a Blob to a File for upload
 */
export function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/**
 * Check if IndexedDB is available in the current environment
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
