/**
 * IndexedDB Offline Queue for Food Images
 *
 * Stores food images locally when offline and syncs when connection is restored.
 * Enables zero-friction logging even in spotty connection areas.
 */

const DB_NAME = 'opennutri-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-images';

export interface PendingImage {
  id: string;
  file: Blob;
  fileName: string;
  fileType: string;
  fileSize: number;
  mealType: string;
  timestamp: number;
  retryCount: number;
}

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('retryCount', 'retryCount', { unique: false });
      }
    };
  });
}

/**
 * Add an image to the offline queue
 */
export async function addToOfflineQueue(
  file: Blob,
  fileName: string,
  mealType: string
): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

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

    const request = store.add(pendingImage);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending images from the queue
 */
export async function getPendingImages(): Promise<PendingImage[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by timestamp (oldest first)
      const results = request.result.sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove an image from the queue after successful upload
 */
export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Increment retry count for a failed upload
 */
export async function incrementRetryCount(id: string): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item.retryCount += 1;
        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve(item.retryCount);
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(0);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Clear old pending images (older than 24 hours)
 */
export async function clearOldPendingImages(maxAgeHours = 24): Promise<number> {
  const db = await openDB();
  const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as PendingImage;
        if (item.timestamp < cutoffTime) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the count of pending images
 */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
