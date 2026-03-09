/**
 * Persistent Local Semantic Cache
 * 
 * Stores user-specific food mappings and their embeddings in IndexedDB.
 * Allows for instant, offline food matching for frequent items.
 */

import { db, type LocalSemanticMatch } from './db-local';
import { generateEmbedding } from './embeddings';

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  
  if (mA === 0 || mB === 0) return 0;
  
  return dotProduct / (mA * mB);
}

/**
 * Pre-populate the local index with common foods
 */
export async function syncSmallCoreIndex(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch('/data/small-core-index.json');
    const commonFoods = await response.json();
    
    const count = await db.localSemanticCache.count();
    // If we have less than the "core" items, seed it
    if (count < commonFoods.length) {
      console.log('Seeding local semantic index with common foods...');
      
      // Process in batches to avoid locking the UI/Worker too long
      for (const food of commonFoods) {
        const existing = await db.localSemanticCache.get(food.id);
        if (!existing) {
          // generateEmbedding uses the worker internally
          const embedding = await generateEmbedding(food.description);
          await db.localSemanticCache.put({
            id: food.id,
            description: food.description,
            embedding,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            lastUsed: Date.now(),
          });
        }
      }
      console.log('Local semantic index seeded successfully.');
    }
  } catch (error) {
    console.error('Failed to sync small-core index:', error);
  }
}

/**
 * Search local history for a semantic match
 * Task 1.3: Portion Memory - Returns typical portion if available
 */
export async function searchLocalHistory(
  foodName: string
): Promise<(LocalSemanticMatch & { typicalQuantity?: number; typicalUnit?: string; typicalServingGrams?: number }) | null> {
  if (typeof window === 'undefined') return null;

  try {
    const queryEmbedding = await generateEmbedding(foodName);
    const allItems = await db.localSemanticCache.toArray();

    let bestMatch: LocalSemanticMatch | null = null;
    let highestSimilarity = -1;

    for (const item of allItems) {
      let similarity = cosineSimilarity(queryEmbedding, item.embedding);
      
      // Boost similarity for items with portion memory (user's habitual portions)
      if (item.typicalQuantity && item.typicalUnit && item.portionFrequency && item.portionFrequency > 2) {
        similarity *= 1.1; // 10% boost for well-established portion habits
      }
      
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = item;
      }
    }

    if (bestMatch && highestSimilarity >= SIMILARITY_THRESHOLD) {
      // Update last used timestamp
      await db.localSemanticCache.update(bestMatch.id, { lastUsed: Date.now() });
      return {
        ...bestMatch,
        typicalQuantity: bestMatch.typicalQuantity,
        typicalUnit: bestMatch.typicalUnit,
        typicalServingGrams: bestMatch.typicalServingGrams,
      };
    }

    return null;
  } catch (error) {
    console.error('Local semantic search failed:', error);
    return null;
  }
}

/**
 * Add a food item to the local semantic cache
 * Task 1.3: Portion Memory - Store user's typical portion habits
 */
export async function addToLocalCache(
  item: {
    id: string | number;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sodium?: number;
    numericQuantity?: number;
    unit?: string;
    servingGrams?: number;
  },
  isUserPortion: boolean = true
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const embedding = await generateEmbedding(item.description);
    const existing = await db.localSemanticCache.get(String(item.id));

    // If this is a user portion and we have existing data, update portion frequency
    if (isUserPortion && existing && item.numericQuantity && item.unit) {
      const samePortion = existing.typicalQuantity === item.numericQuantity && 
                          existing.typicalUnit === item.unit;
      
      await db.localSemanticCache.put({
        id: String(item.id),
        description: item.description,
        embedding,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        sodium: item.sodium,
        lastUsed: Date.now(),
        typicalQuantity: item.numericQuantity,
        typicalUnit: item.unit,
        typicalServingGrams: item.servingGrams,
        portionFrequency: samePortion ? (existing.portionFrequency || 0) + 1 : existing.portionFrequency || 0,
      });
    } else if (!existing) {
      // New item - add with portion data if available
      await db.localSemanticCache.put({
        id: String(item.id),
        description: item.description,
        embedding,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        sodium: item.sodium,
        lastUsed: Date.now(),
        typicalQuantity: item.numericQuantity,
        typicalUnit: item.unit,
        typicalServingGrams: item.servingGrams,
        portionFrequency: item.numericQuantity && item.unit ? 1 : 0,
      });
    } else {
      // Update existing without changing portion data
      await db.localSemanticCache.put({
        ...existing,
        lastUsed: Date.now(),
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        sodium: item.sodium ?? existing.sodium,
      });
    }
  } catch (error) {
    console.error('Failed to add to local semantic cache:', error);
  }
}

/**
 * Get top N frequent foods from local cache
 */
export async function getFrequentFoods(limit: number = 10): Promise<LocalSemanticMatch[]> {
  return db.localSemanticCache
    .orderBy('lastUsed')
    .reverse()
    .limit(limit)
    .toArray();
}
