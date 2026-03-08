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

export class OpenNutriDB extends Dexie {
  pendingImages!: Table<PendingImage>;
  foodLogs!: Table<LocalFoodLog>;
  decryptedLogs!: Table<DecryptedFoodLog>;
  userTargets!: Table<LocalUserTarget>;
  userFavorites!: Table<UserFavorite>;

  constructor() {
    super('OpenNutriDB');
    this.version(3).stores({
      pendingImages: 'id, timestamp',
      foodLogs: 'id, userId, timestamp, synced, updatedAt',
      decryptedLogs: 'id, userId, timestamp',
      userTargets: '[userId+date], userId, date, synced, updatedAt',
      userFavorites: 'id, foodName, frequency, lastUsed',
    });
  }
}

export const db = new OpenNutriDB();
