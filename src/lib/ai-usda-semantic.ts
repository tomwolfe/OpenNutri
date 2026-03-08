/**
 * Semantic Food Matching Service
 * 
 * Uses vector embeddings (pgvector) to match AI-detected foods 
 * with USDA database entries using cosine similarity.
 * 
 * This replaces the Levenshtein distance matching with semantic search,
 * allowing "fried bird" to match "Fried Chicken" correctly.
 */

import { db } from '@/lib/db';
import { usdaCache } from '@/db/schema';
import { generateEmbedding, toVector, cleanFoodDescription } from '@/lib/embeddings';
import { cosineDistance, desc, sql } from 'drizzle-orm';
import { searchFoods, extractMacros, type USDAFoodItem } from '@/lib/usda';

/**
 * Match a food name to USDA entry and return multiple potential matches
 */
export async function matchFoodToUSDAWithAlternatives(
  foodName: string,
  limit: number = 5
): Promise<USDAFoodItem[]> {
  try {
    const cleanName = cleanFoodDescription(foodName);
    if (cleanName.length < 2) return [];

    const embedding = await generateEmbedding(cleanName);
    const queryVector = toVector(embedding);

    // Search cache
    const matches = await searchCacheBySimilarity(queryVector, limit);
    
    if (matches.length > 0) {
      return matches.map(m => ({
        fdcId: m.fdcId,
        description: m.description,
        dataType: m.dataType || 'Cached',
        similarity: m.similarity,
        foodNutrients: [
          { nutrientName: 'Energy', value: m.calories || 0, unitName: 'kcal' },
          { nutrientName: 'Protein', value: m.protein || 0, unitName: 'g' },
          { nutrientName: 'Carbohydrate, by difference', value: m.carbs || 0, unitName: 'g' },
          { nutrientName: 'Total lipid (fat)', value: m.fat || 0, unitName: 'g' },
        ],
      }));
    }

    // USDA API Search Fallback
    const results = await searchFoods(cleanName, 10, 1);
    if (!results.foods || results.foods.length === 0) return [];

    await cacheUSDAItems(results.foods);
    
    const freshMatches = await searchCacheBySimilarity(queryVector, limit);
    return freshMatches.map(m => ({
      fdcId: m.fdcId,
      description: m.description,
      dataType: m.dataType || 'Foundation',
      similarity: m.similarity,
      foodNutrients: [
        { nutrientName: 'Energy', value: m.calories || 0, unitName: 'kcal' },
        { nutrientName: 'Protein', value: m.protein || 0, unitName: 'g' },
        { nutrientName: 'Carbohydrate, by difference', value: m.carbs || 0, unitName: 'g' },
        { nutrientName: 'Total lipid (fat)', value: m.fat || 0, unitName: 'g' },
      ],
    }));
  } catch (error) {
    console.error(`Failed to match "${foodName}" with alternatives:`, error);
    return [];
  }
}

/**
 * Match a food name to USDA entry using semantic search
 * @param foodName - AI-detected food name
 * @returns Best match USDA food item or null
 */
export async function matchFoodToUSDA(foodName: string): Promise<USDAFoodItem | null> {
  const matches = await matchFoodToUSDAWithAlternatives(foodName, 1);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Search USDA cache by vector similarity
 */
async function searchCacheBySimilarity(
  queryVector: string,
  limit: number = 5
): Promise<Array<{
  fdcId: number;
  description: string;
  dataType: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  similarity: number;
}>> {
  try {
    const similarity = sql<number>`1 - (${cosineDistance(usdaCache.embedding, queryVector)})`;
    
    const results = await db
      .select({
        fdcId: usdaCache.fdcId,
        description: usdaCache.description,
        dataType: usdaCache.dataType,
        calories: usdaCache.calories,
        protein: usdaCache.protein,
        carbs: usdaCache.carbs,
        fat: usdaCache.fat,
        similarity: similarity.as('similarity'),
      })
      .from(usdaCache)
      .where(sql`${similarity} > 0.5`) // Return more potential matches for fallback UI
      .orderBy(desc(similarity))
      .limit(limit);

    // Update last accessed time for cache management
    if (results.length > 0) {
      await db
        .update(usdaCache)
        .set({ lastAccessed: new Date() })
        .where(
          sql`${usdaCache.fdcId} IN (${results.map(r => r.fdcId)})`
        );
    }

    return results;
  } catch (error) {
    // If pgvector is not set up yet, fall back to empty results
    if (error instanceof Error && error.message.includes('vector')) {
      console.warn('pgvector not available, falling back to empty cache');
      return [];
    }
    throw error;
  }
}

/**
 * Cache USDA food items with their embeddings
 */
async function cacheUSDAItems(items: USDAFoodItem[]): Promise<void> {
  try {
    for (const item of items) {
      const cleanDesc = cleanFoodDescription(item.description);
      const embedding = await generateEmbedding(cleanDesc);
      const macros = extractMacros(item);

      await db
        .insert(usdaCache)
        .values({
          fdcId: item.fdcId,
          description: item.description,
          dataType: item.dataType,
          embedding: embedding, // Pass as array, drizzle handles conversion
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
        })
        .onConflictDoNothing({ target: usdaCache.fdcId });
    }
  } catch (error) {
    console.error('Failed to cache USDA items:', error);
  }
}

/**
 * Hybrid matching: combines semantic search with keyword matching
 * Falls back to Levenshtein for edge cases
 */
export async function hybridMatch(foodName: string): Promise<USDAFoodItem | null> {
  // Try semantic match first
  const semanticMatch = await matchFoodToUSDA(foodName);
  
  if (semanticMatch) {
    return semanticMatch;
  }

  // Fallback: traditional keyword search
  const cleanName = cleanFoodDescription(foodName);
  const results = await searchFoods(cleanName, 5, 1);
  
  if (results.foods && results.foods.length > 0) {
    // Cache these items for future semantic searches
    await cacheUSDAItems(results.foods);
    return results.foods[0];
  }

  return null;
}

/**
 * Batch match multiple food items
 * More efficient than individual matching
 */
export async function batchMatchFoods(
  foodNames: string[]
): Promise<Map<string, USDAFoodItem | null>> {
  const results = new Map<string, USDAFoodItem | null>();

  // Process in parallel with concurrency limit
  const concurrencyLimit = 5;
  
  for (let i = 0; i < foodNames.length; i += concurrencyLimit) {
    const batch = foodNames.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(name => matchFoodToUSDA(name))
    );
    
    batchResults.forEach((match, idx) => {
      results.set(batch[idx], match);
    });
  }

  return results;
}
