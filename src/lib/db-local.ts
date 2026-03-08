import Dexie, { type Table } from 'dexie';

/**
 * OpenNutri Local-First Database
 * 
 * Powered by Dexie.js for IndexedDB management.
 * Provides a reactive, high-performance layer for encrypted data.
 */

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

export interface LocalFoodLog {
  id: string;
  userId: string;
  timestamp: Date;
  mealType: string | null;
  totalCalories: number | null;
  aiConfidenceScore: number | null;
  isVerified: boolean;
  imageUrl: string | null;
  notes: string | null;
  yjsData?: string | null; // Base64 encoded Yjs update
  encryptedData: string;
  encryptionIv: string;
  encryptionSalt: string | null;
  version: number;
  deviceId: string | null;
  synced: boolean;
  updatedAt: number; // Unix timestamp for sync delta
}

export interface DecryptedFoodLog {
  id: string;
  userId: string;
  timestamp: Date;
  mealType: string | null;
  totalCalories: number | null;
  items: unknown[];
  notes: string | null;
  imageUrl?: string | null;
  imageIv?: string | null;
  version?: number;
}

export interface LocalUserTarget {
  userId: string;
  date: string; // YYYY-MM-DD
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbTarget: number | null;
  fatTarget: number | null;
  weightRecord: number | null;
  highSodium?: boolean;
  highCarbs?: boolean;
  yjsData?: string | null; // Base64 encoded Yjs update
  version: number;
  deviceId: string | null;
  synced: boolean;
  updatedAt: number;
}

export interface UserFavorite {
  id: string; // Combined foodName or fdcId
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  frequency: number;
  lastUsed: Date;
}

export interface DecryptedImage {
  id: string; // imageUrl
  blob: Blob;
  timestamp: number;
}

export interface LocalUserRecipe {
  id: string;
  userId: string;
  name: string;
  description?: string;
  encryptedData: string;
  encryptionIv: string;
  updatedAt: string;
  synced: 0 | 1;
}

export interface LocalHealthData {
  date: string; // YYYY-MM-DD
  userId: string;
  steps?: number;
  activeCalories?: number;
  source: 'apple_health' | 'google_fit' | 'manual';
  updatedAt: number;
}

export interface LocalVaultKey {
  userId: string;
  credentialId: string;
  encryptedVaultKey: string; // Base64
  iv: string; // Base64
  updatedAt: number;
}

export interface LocalSemanticMatch {
  id: string; // fdcId string or foodName
  description: string;
  embedding: number[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  lastUsed: number;
}

export class OpenNutriDB extends Dexie {
  pendingImages!: Table<PendingImage>;
  foodLogs!: Table<LocalFoodLog>;
  decryptedLogs!: Table<DecryptedFoodLog>;
  userTargets!: Table<LocalUserTarget>;
  userFavorites!: Table<UserFavorite>;
  decryptedImages!: Table<DecryptedImage>;
  userRecipes!: Table<LocalUserRecipe>;
  healthData!: Table<LocalHealthData>;
  vaultKeys!: Table<LocalVaultKey>;
  localSemanticCache!: Table<LocalSemanticMatch>;

  constructor() {
    super('OpenNutriDB');
    this.version(8).stores({
      pendingImages: 'id, timestamp',
      foodLogs: 'id, userId, timestamp, synced, updatedAt',
      decryptedLogs: 'id, userId, timestamp',
      userTargets: '[userId+date], userId, date, synced, updatedAt',
      userFavorites: 'id, foodName, frequency, lastUsed',
      decryptedImages: 'id, timestamp',
      userRecipes: 'id, userId, name, synced, updatedAt',
      healthData: '[userId+date], userId, date',
      vaultKeys: 'userId, credentialId',
      localSemanticCache: 'id, lastUsed',
    });
  }

  /**
   * Cleanup Decrypted Images
   * 
   * Removes cached decrypted blobs that are older than the specified TTL.
   * Default TTL is 1 hour (3600000ms).
   */
  async cleanupDecryptedImages(ttlMs: number = 3600000) {
    const cutoff = Date.now() - ttlMs;
    try {
      const oldImages = await this.decryptedImages
        .where('timestamp')
        .below(cutoff)
        .delete();
      
      if (oldImages > 0) {
        console.log(`Cleaned up ${oldImages} old decrypted images from cache.`);
      }
    } catch (err) {
      console.error('Failed to cleanup decrypted images:', err);
    }
  }
}

export const db = new OpenNutriDB();
