/**
 * USDA FoodData Central API Client
 * 
 * Fetches nutritional data from USDA's public API
 * Free tier: No API key required for basic search (with rate limits)
 */

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

export interface USDAFoodItem {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: FoodNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
  similarity?: number;
}

export interface FoodNutrient {
  nutrientName: string;
  value: number;
  unitName: string;
}

export interface SearchResults {
  foods: USDAFoodItem[];
  totalHits: number;
  currentPage: number;
  totalPages: number;
}

/**
 * Search for food items by query string
 */
export async function searchFoods(
  query: string,
  pageSize: number = 10,
  pageNumber: number = 1
): Promise<SearchResults> {
  const apiKey = process.env.USDA_API_KEY;

  const params = new URLSearchParams({
    query,
    // Note: dataType parameter removed as it causes 400 errors with special characters
    // The API now returns all data types by default
    pageSize: pageSize.toString(),
    pageNumber: pageNumber.toString(),
    sortBy: 'dataType.keyword',
    sortOrder: 'asc',
  });

  if (apiKey) {
    params.append('api_key', apiKey);
  }

  const response = await fetch(`${USDA_BASE_URL}/foods/search?${params}`, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!response.ok) {
    throw new Error(`USDA API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get detailed food information by FDC ID
 */
export async function getFoodDetails(fdcId: number): Promise<USDAFoodItem> {
  const apiKey = process.env.USDA_API_KEY;
  
  const params = new URLSearchParams({
    nutrients: '203,204,205,269', // Protein, Fat, Carbs, Calories
  });

  if (apiKey) {
    params.append('api_key', apiKey);
  }

  const response = await fetch(`${USDA_BASE_URL}/food/${fdcId}?${params}`, {
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`USDA API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Extract macronutrients and micronutrients from USDA food item
 */
export function extractMacros(food: USDAFoodItem) {
  const nutrients = food.foodNutrients || [];
  
  const getNutrient = (name: string): number => {
    const searchLower = name.toLowerCase().trim();
    const nutrient = nutrients.find(n => {
      const nName = n.nutrientName.toLowerCase();
      return nName === searchLower || nName.startsWith(searchLower + ',');
    });
    return nutrient ? nutrient.value : 0;
  };

  return {
    calories: getNutrient('Energy'),
    protein: getNutrient('Protein'),
    carbs: getNutrient('Carbohydrate, by difference'),
    fat: getNutrient('Total lipid (fat)'),
    micronutrients: {
      fiber: getNutrient('Fiber, total dietary'),
      sugar: getNutrient('Sugars, total including NLEA'),
      sodium: getNutrient('Sodium, Na'),
      potassium: getNutrient('Potassium, K'),
      calcium: getNutrient('Calcium, Ca'),
      iron: getNutrient('Iron, Fe'),
      vitaminC: getNutrient('Vitamin C, total ascorbic acid'),
      saturatedFat: getNutrient('Fatty acids, total saturated'),
      cholesterol: getNutrient('Cholesterol'),
    }
  };
}

/**
 * Calculate macros for a specific portion size based on 100g USDA data
 * @param baseMacros - Macros and micros per 100g
 * @param quantity - Numeric quantity (e.g. 2)
 * @param unit - Unit (e.g. "slice", "g", "cup")
 * @param densityFactor - Optional density (g per unit) if known (e.g. 150g for 1 cup of some food)
 */
export function calculateMacrosByPortion(
  baseMacros: { 
    calories: number; 
    protein: number; 
    carbs: number; 
    fat: number;
    micronutrients?: {
      fiber: number;
      sugar: number;
      sodium: number;
      potassium: number;
      calcium: number;
      iron: number;
      vitaminC: number;
      saturatedFat: number;
      cholesterol: number;
    }
  },
  quantity: number,
  unit: string,
  densityFactor: number = 100 // Default to 100g per unit if unknown
) {
  let totalGrams = 100;

  const unitLower = unit.toLowerCase().trim();
  
  // Standard weight units
  if (unitLower === 'g' || unitLower === 'grams' || unitLower === 'gram') {
    totalGrams = quantity;
  } else if (unitLower === 'oz' || unitLower === 'ounce' || unitLower === 'ounces') {
    totalGrams = quantity * 28.35;
  } else if (unitLower === 'lb' || unitLower === 'pound' || unitLower === 'pounds') {
    totalGrams = quantity * 453.59;
  } else if (unitLower === 'kg' || unitLower === 'kilogram' || unitLower === 'kilograms') {
    totalGrams = quantity * 1000;
  } 
  // Standard volume units (approximate density used)
  else if (unitLower === 'cup' || unitLower === 'cups') {
    totalGrams = quantity * 240; // Assume water-like density if no densityFactor provided
  } else if (unitLower === 'tbsp' || unitLower === 'tablespoon' || unitLower === 'tablespoons') {
    totalGrams = quantity * 15;
  } else if (unitLower === 'tsp' || unitLower === 'teaspoon' || unitLower === 'teaspoons') {
    totalGrams = quantity * 5;
  }
  // Discrete units
  else {
    // For "slice", "piece", "apple", etc., we use the densityFactor
    // If AI provides 100 as default density, it effectively uses the base macros
    totalGrams = quantity * (densityFactor || 100);
  }

  const ratio = totalGrams / 100;

  return {
    calories: Math.round(baseMacros.calories * ratio),
    protein: Number((baseMacros.protein * ratio).toFixed(1)),
    carbs: Number((baseMacros.carbs * ratio).toFixed(1)),
    fat: Number((baseMacros.fat * ratio).toFixed(1)),
    micronutrients: baseMacros.micronutrients ? {
      fiber: Number((baseMacros.micronutrients.fiber * ratio).toFixed(1)),
      sugar: Number((baseMacros.micronutrients.sugar * ratio).toFixed(1)),
      sodium: Math.round(baseMacros.micronutrients.sodium * ratio),
      potassium: Math.round(baseMacros.micronutrients.potassium * ratio),
      calcium: Math.round(baseMacros.micronutrients.calcium * ratio),
      iron: Number((baseMacros.micronutrients.iron * ratio).toFixed(2)),
      vitaminC: Number((baseMacros.micronutrients.vitaminC * ratio).toFixed(1)),
      saturatedFat: Number((baseMacros.micronutrients.saturatedFat * ratio).toFixed(1)),
      cholesterol: Math.round(baseMacros.micronutrients.cholesterol * ratio),
    } : undefined,
    grams: Math.round(totalGrams)
  };
}
