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
 * Search local history for a semantic match
 */
export async function searchLocalHistory(
  foodName: string
): Promise<LocalSemanticMatch | null> {
  if (typeof window === 'undefined') return null;

  try {
    const queryEmbedding = await generateEmbedding(foodName);
    const allItems = await db.localSemanticCache.toArray();
    
    let bestMatch: LocalSemanticMatch | null = null;
    let highestSimilarity = -1;

    for (const item of allItems) {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = item;
      }
    }

    if (bestMatch && highestSimilarity >= SIMILARITY_THRESHOLD) {
      // Update last used timestamp
      await db.localSemanticCache.update(bestMatch.id, { lastUsed: Date.now() });
      return bestMatch;
    }

    return null;
  } catch (error) {
    console.error('Local semantic search failed:', error);
    return null;
  }
}

/**
 * Add a food item to the local semantic cache
 */
export async function addToLocalCache(
  item: {
    id: string | number;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const embedding = await generateEmbedding(item.description);
    
    await db.localSemanticCache.put({
      id: String(item.id),
      description: item.description,
      embedding,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      lastUsed: Date.now(),
    });
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
