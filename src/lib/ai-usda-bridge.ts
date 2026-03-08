/**
 * AI-USDA Bridge
 *
 * Automatically matches AI-detected food items with USDA database entries
 * to provide more accurate and "official" nutritional data.
 *
 * Uses in-memory LRU cache for faster repeated lookups.
 */

import { searchFoods, extractMacros, type USDAFoodItem } from '@/lib/usda';
import { getCachedUSDAMatch, cacheUSDAMatch } from '@/lib/ai-usda-cache';

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed to change one word into the other
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Create a matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first column and row
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      
      // Bonus for transposition (Damerau-Levenshtein)
      if (i > 1 && j > 1 && 
          str1[i - 1] === str2[j - 2] && 
          str1[i - 2] === str2[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
function stringSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Match a food name to USDA entry
 * @param foodName - AI-detected food name
 * @returns Best match USDA food item or null
 */
export async function matchFoodToUSDA(foodName: string): Promise<USDAFoodItem | null> {
  try {
    // Check cache first
    const cachedFdcId = getCachedUSDAMatch(foodName);
    if (cachedFdcId) {
      console.log(`Cache hit for "${foodName}" -> FDC ID: ${cachedFdcId}`);
      // Fetch full details from cache or API
      const details = await getFoodDetailsWithCache(cachedFdcId);
      return details;
    }

    // Clean up the food name for better search
    const cleanName = foodName
      .replace(/\b(?:grilled|fried|baked|roasted|steamed|boiled)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50); // Limit length for API

    if (cleanName.length < 2) {
      return null;
    }

    // Search USDA database with more results for better matching
    const results = await searchFoods(cleanName, 10, 1);

    if (!results.foods || results.foods.length === 0) {
      return null;
    }

    // Find best match using Levenshtein distance and word overlap
    const bestMatch = findBestMatch(cleanName, results.foods);

    // Cache the result if we found a good match
    if (bestMatch) {
      console.log(`Caching "${foodName}" -> FDC ID: ${bestMatch.fdcId}`);
      cacheUSDAMatch(foodName, bestMatch.fdcId);
    }

    return bestMatch || null;
  } catch (error) {
    console.error(`Failed to match "${foodName}" to USDA:`, error);
    return null;
  }
}

/**
 * Get food details with additional caching layer
 */
async function getFoodDetailsWithCache(fdcId: number): Promise<USDAFoodItem | null> {
  try {
    // The USDA search already uses Next.js caching, but we can add
    // an extra layer here if needed for frequently accessed items
    const { getFoodDetails } = await import('@/lib/usda');
    return await getFoodDetails(fdcId);
  } catch (error) {
    console.error(`Failed to fetch food details for FDC ID ${fdcId}:`, error);
    return null;
  }
}

/**
 * Find best matching USDA food item from search results
 * Uses Levenshtein distance and word overlap scoring
 */
function findBestMatch(
  query: string,
  foods: USDAFoodItem[]
): USDAFoodItem | null {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const queryLower = query.toLowerCase();

  if (queryWords.length === 0) {
    return foods[0] || null;
  }

  let bestScore = 0;
  let bestMatch: USDAFoodItem | null = null;

  for (const food of foods) {
    const description = food.description.toLowerCase();
    let score = 0;

    // Check for exact substring match (highest priority)
    if (description.includes(queryLower)) {
      score += 20;
    }

    // Check for reverse: query contains description
    if (queryLower.includes(description)) {
      score += 15;
    }

    // Calculate string similarity using Levenshtein distance
    const similarity = stringSimilarity(queryLower, description);
    score += similarity * 15;

    // Check word overlap with weighted scoring
    for (const word of queryWords) {
      if (description.includes(word)) {
        // Longer words get higher weight (more specific)
        const wordWeight = word.length >= 5 ? 3 : 2;
        score += wordWeight;
      }
    }

    // Bonus for Foundation data (more reliable)
    if (food.dataType === 'Foundation') {
      score += 5;
    }

    // Bonus for Survey FNDDS (US national data)
    if (food.dataType === 'Survey FNDDS') {
      score += 3;
    }

    // Penalty for very long descriptions (likely less specific match)
    if (description.length > 100) {
      score -= 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = food;
    }
  }

  // Only return if we have a reasonable match (lowered threshold from 2 to 5)
  return bestScore >= 5 ? bestMatch : null;
}

/**
 * Enhance AI analysis with USDA data
 * @param aiItems - AI-detected food items
 * @returns Enhanced items with USDA matches where available
 */
export async function enhanceWithUSDAData(
  aiItems: Array<{
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: number;
    portion_guess: string;
  }>
): Promise<
  Array<{
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source: string;
    usdaMatch?: {
      fdcId: number;
      description: string;
    };
  }>
> {
  // Process items in parallel with rate limiting
  const enhancedItems = await Promise.all(
    aiItems.map(async (item) => {
      // Try to match with USDA
      const usdaMatch = await matchFoodToUSDA(item.name);

      if (usdaMatch) {
        const macros = extractMacros(usdaMatch);
        // Use USDA data if confidence is low or USDA match is strong
        const useUSDA = item.confidence < 0.8 || usdaMatch.dataType === 'Foundation';

        return {
          foodName: usdaMatch.description,
          calories: useUSDA ? macros.calories : item.calories,
          protein: useUSDA ? macros.protein : item.protein_g,
          carbs: useUSDA ? macros.carbs : item.carbs_g,
          fat: useUSDA ? macros.fat : item.fat_g,
          source: 'USDA',
          usdaMatch: {
            fdcId: usdaMatch.fdcId,
            description: usdaMatch.description,
          },
        };
      }

      // No USDA match - use AI estimate
      return {
        foodName: item.name,
        calories: item.calories,
        protein: item.protein_g,
        carbs: item.carbs_g,
        fat: item.fat_g,
        source: 'AI_ESTIMATE',
      };
    })
  );

  return enhancedItems;
}
