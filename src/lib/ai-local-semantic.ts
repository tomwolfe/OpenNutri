/**
 * Persistent Local Semantic Cache
 *
 * Stores user-specific food mappings and their embeddings in IndexedDB.
 * Allows for instant, offline food matching for frequent items.
 * 
 * Task 1.6: Pre-compute embeddings for top 500 foods
 * Task 1.5: Use worker-based embedding generation
 */

import { db, type LocalSemanticMatch } from './db-local';
import { generateEmbedding } from './embeddings';
import { type Micronutrients } from '@/types/food';

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
 * Task 2.3: Offline USDA Cache - Cache top 500 common items
 */
export async function syncSmallCoreIndex(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Try to fetch from our new API endpoint first
    let commonFoods: Array<{
      id: string;
      description: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      sodium?: number;
    }> = [];

    try {
      const response = await fetch('/api/food/usda/common');
      const data = await response.json();
      commonFoods = data.foods.map((f: any) => ({
        id: String(f.fdcId),
        description: f.description,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        sodium: f.sodium,
      }));
    } catch (err) {
      console.warn('Failed to fetch common foods from API, falling back to local file:', err);
      // Fallback to static file
      const response = await fetch('/data/small-core-index.json');
      const staticFoods = await response.json();
      commonFoods = staticFoods;
    }

    const count = await db.localSemanticCache.count();
    
    // Only seed if we have less than 100 items (avoid re-seeding on every load)
    if (count < 100) {
      console.log(`Seeding local semantic index with ${commonFoods.length} common foods...`);

      // Process in batches to avoid locking the UI/Worker too long
      const BATCH_SIZE = 50;
      for (let i = 0; i < commonFoods.length; i += BATCH_SIZE) {
        const batch = commonFoods.slice(i, i + BATCH_SIZE);
        
        // Use Promise.all for parallel embedding generation within batch
        await Promise.all(batch.map(async (food) => {
          try {
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
                sodium: food.sodium,
                lastUsed: Date.now(),
                // Initialize with default portion (100g)
                typicalQuantity: 1,
                typicalUnit: 'serving',
                typicalServingGrams: 100,
                portionFrequency: 0,
              });
            }
          } catch (err) {
            console.error(`Failed to seed food "${food.description}":`, err);
          }
        }));

        // Yield to main thread between batches
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const finalCount = await db.localSemanticCache.count();
      console.log(`Local semantic index seeded successfully with ${finalCount} items.`);
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
      if (item.typicalQuantity && item.typicalUnit && item.portionFrequency && item.portionFrequency > 3) {
        similarity *= 1.15; // 15% boost for well-established portion habits
      }

      // Task 4.3: Time of Day Weighting
      // Prioritize foods logged around the same time of day (e.g., Breakfast foods in the morning)
      if (item.lastUsed) {
        const itemHour = new Date(item.lastUsed).getHours();
        const currentHour = new Date().getHours();
        const hourDiff = Math.min(Math.abs(currentHour - itemHour), 24 - Math.abs(currentHour - itemHour));
        
        if (hourDiff <= 2) {
          similarity *= 1.1; // 10% boost for items used within 2 hours of current time in the past
        }
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
    micronutrients?: Micronutrients;
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
      
      // Task 4.3: Robust Portion Memory
      // Only switch the "default" portion if the current one isn't established (freq <= 3)
      // or if the new portion eventually out-competes it (decay-based switch)
      let typicalQuantity = existing.typicalQuantity;
      let typicalUnit = existing.typicalUnit;
      let typicalServingGrams = existing.typicalServingGrams;
      let portionFrequency = existing.portionFrequency || 0;

      if (samePortion) {
        portionFrequency++;
      } else if (portionFrequency <= 3) {
        // Switch immediately if current portion isn't a strong habit yet
        typicalQuantity = item.numericQuantity;
        typicalUnit = item.unit;
        typicalServingGrams = item.servingGrams;
        portionFrequency = 1;
      } else {
        // "Decay" the habit strength of the old portion. 
        // This ensures the user must log the new portion consistently to change the default.
        portionFrequency--;
      }

      await db.localSemanticCache.put({
        ...existing,
        lastUsed: Date.now(),
        typicalQuantity,
        typicalUnit,
        typicalServingGrams,
        portionFrequency,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        micronutrients: item.micronutrients || existing.micronutrients,
        sodium: item.sodium ?? existing.sodium,
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
        micronutrients: item.micronutrients,
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
        micronutrients: item.micronutrients || existing.micronutrients,
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
