/**
 * OpenNutri Database Schema
 * 
 * Matches the SQL specification with Drizzle ORM types.
 * Optimized for NeonDB serverless Postgres.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  uuid,
  date,
  boolean,
  index,
  primaryKey,
  vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// AI Usage Tracking Table
// ============================================
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
}, (table) => ({
  timestampIdx: index('ai_usage_timestamp_idx').on(table.timestamp),
  userIdTimestampIdx: index('ai_usage_user_id_timestamp_idx').on(table.userId, table.timestamp),
}));

// ============================================
// Users Table
// ============================================
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  subscriptionTier: text('subscription_tier').default('free'),
  weightGoal: text('weight_goal').default('maintain'), // lose, maintain, gain
  // Profile fields for TDEE calculation
  birthDate: date('birth_date'),
  gender: text('gender'), // male, female, other
  heightCm: integer('height_cm'),
  activityLevel: text('activity_level'), // sedentary, light, moderate, active, very_active
});

// ============================================
// User Targets Table (daily nutrition goals)
// ============================================
export const userTargets = pgTable('user_targets', {
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  date: date('date').notNull(),
  calorieTarget: integer('calorie_target'),
  proteinTarget: integer('protein_target'),
  carbTarget: integer('carb_target'),
  fatTarget: integer('fat_target'),
  weightRecord: doublePrecision('weight_record'),
  version: integer('version').default(1).notNull(),
  deviceId: text('device_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.date] }),
  dateIdx: index('user_targets_date_idx').on(table.date),
  updatedAtIdx: index('user_targets_updated_at_idx').on(table.updatedAt),
}));

// ============================================
// Food Logs Table (daily meal entries)
// ============================================
export const foodLogs = pgTable('food_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
  mealType: text('meal_type'), // breakfast, lunch, dinner, snack
  totalCalories: integer('total_calories'),
  aiConfidenceScore: doublePrecision('ai_confidence_score'), // >0 for AI-assisted, 0/null for manual
  isVerified: boolean('is_verified').default(false),
  imageUrl: text('image_url'), // Vercel Blob URL for meal photo
  notes: text('notes'), // AI-generated explanations or user notes
  // E2E encryption fields (Phase 3)
  encryptedData: text('encrypted_data').notNull(), // Encrypted log items (AES-GCM)
  encryptionIv: text('encryption_iv').notNull(), // IV for decryption
  encryptionSalt: text('encryption_salt'), // Salt for key derivation (optional if using user-level salt)
  version: integer('version').default(1).notNull(),
  deviceId: text('device_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('food_logs_user_id_idx').on(table.userId),
  timestampIdx: index('food_logs_timestamp_idx').on(table.timestamp),
  updatedAtIdx: index('food_logs_updated_at_idx').on(table.updatedAt),
}));

// ============================================
// Log Items Table (individual food items)
// ============================================
export const logItems = pgTable('log_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  logId: uuid('log_id')
    .references(() => foodLogs.id, { onDelete: 'cascade' })
    .notNull(),
  foodName: text('food_name'),
  calories: integer('calories'),
  protein: doublePrecision('protein'),
  carbs: doublePrecision('carbs'),
  fat: doublePrecision('fat'),
  source: text('source'), // USDA, AI_ESTIMATE, OPEN_FACTS, USER_CACHE
}, (table) => ({
  logIdIdx: index('log_items_log_id_idx').on(table.logId),
  foodNameIdx: index('log_items_food_name_idx').on(table.foodName),
}));

// ============================================
// Table Relations (for Drizzle queries)
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  userTargets: many(userTargets),
  foodLogs: many(foodLogs),
  aiUsage: many(aiUsage),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(users, {
    fields: [aiUsage.userId],
    references: [users.id],
  }),
}));

export const userTargetsRelations = relations(userTargets, ({ one }) => ({
  user: one(users, {
    fields: [userTargets.userId],
    references: [users.id],
  }),
}));

export const foodLogsRelations = relations(foodLogs, ({ one, many }) => ({
  user: one(users, {
    fields: [foodLogs.userId],
    references: [users.id],
  }),
  logItems: many(logItems),
}));

export const logItemsRelations = relations(logItems, ({ one }) => ({
  foodLog: one(foodLogs, {
    fields: [logItems.logId],
    references: [foodLogs.id],
  }),
}));

// ============================================
// USDA Cache Table with Vector Embeddings
// ============================================
/**
 * Caches USDA food items with their vector embeddings for semantic search.
 * Embeddings are generated from food descriptions for similarity matching.
 */
export const usdaCache = pgTable('usda_cache', {
  fdcId: integer('fdc_id').primaryKey(),
  description: text('description').notNull(),
  dataType: text('data_type'),
  embedding: vector('embedding', { dimensions: 1024 }), // GLM embedding dimension
  calories: doublePrecision('calories'),
  protein: doublePrecision('protein'),
  carbs: doublePrecision('carbs'),
  fat: doublePrecision('fat'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Vector similarity index for fast semantic search
  embeddingIdx: index('usda_cache_embedding_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
  descriptionIdx: index('usda_cache_description_idx').on(table.description),
  lastAccessedIdx: index('usda_cache_last_accessed_idx').on(table.lastAccessed),
}));

export const usdaCacheRelations = relations(usdaCache, () => ({}));

// ============================================
// User Encryption Keys Table
// ============================================
/**
 * Stores encryption key metadata for E2E encryption.
 * The actual key is encrypted with user's password and never stored in plaintext.
 */
export const userKeys = pgTable('user_keys', {
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),
  salt: text('salt').notNull(), // Salt for PBKDF2 key derivation
  encryptedVaultKey: text('encrypted_vault_key').notNull(), // Encrypted master key
  encryptionIv: text('encryption_iv').notNull(), // IV for decryption
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastRotated: timestamp('last_rotated', { withTimezone: true }),
});

export const userKeysRelations = relations(userKeys, ({ one }) => ({
  user: one(users, {
    fields: [userKeys.userId],
    references: [users.id],
  }),
}));

// ============================================
// Type Exports (for TypeScript)
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

export type UserTargets = typeof userTargets.$inferSelect;
export type NewUserTargets = typeof userTargets.$inferInsert;

export type FoodLog = typeof foodLogs.$inferSelect;
export type NewFoodLog = typeof foodLogs.$inferInsert;

export type LogItem = typeof logItems.$inferSelect;
export type NewLogItem = typeof logItems.$inferInsert;

export type UsdaCache = typeof usdaCache.$inferSelect;
export type NewUsdaCache = typeof usdaCache.$inferInsert;

export type UserKeys = typeof userKeys.$inferSelect;
export type NewUserKeys = typeof userKeys.$inferInsert;
