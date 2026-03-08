/**
 * AI-USDA Bridge
 *
 * Automatically matches AI-detected food items with USDA database entries
 * to provide more accurate and "official" nutritional data.
 */

import { searchFoods, extractMacros, type USDAFoodItem } from '@/lib/usda';

/**
 * Match a food name to USDA entry
 * @param foodName - AI-detected food name
 * @returns Best match USDA food item or null
 */
export async function matchFoodToUSDA(foodName: string): Promise<USDAFoodItem | null> {
  try {
    // Clean up the food name for better search
    const cleanName = foodName
      .replace(/\b(?:grilled|fried|baked|roasted|steamed|boiled)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50); // Limit length for API

    if (cleanName.length < 2) {
      return null;
    }

    // Search USDA database
    const results = await searchFoods(cleanName, 5, 1);

    if (!results.foods || results.foods.length === 0) {
      return null;
    }

    // Find best match using simple string similarity
    const bestMatch = findBestMatch(cleanName, results.foods);

    return bestMatch || null;
  } catch (error) {
    console.error(`Failed to match "${foodName}" to USDA:`, error);
    return null;
  }
}

/**
 * Find best matching USDA food item from search results
 * Uses word overlap scoring
 */
function findBestMatch(
  query: string,
  foods: USDAFoodItem[]
): USDAFoodItem | null {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (queryWords.length === 0) {
    return foods[0] || null;
  }

  let bestScore = 0;
  let bestMatch: USDAFoodItem | null = null;

  for (const food of foods) {
    const description = food.description.toLowerCase();
    let score = 0;

    // Check for exact substring match
    if (description.includes(query.toLowerCase())) {
      score += 10;
    }

    // Check word overlap
    for (const word of queryWords) {
      if (description.includes(word)) {
        score += 2;
      }
    }

    // Bonus for Foundation data (more reliable)
    if (food.dataType === 'Foundation') {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = food;
    }
  }

  // Only return if we have a reasonable match
  return bestScore >= 2 ? bestMatch : null;
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
