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
    dataType: 'Foundation,SR Legacy,Survey (FNDDS)',
    pageSize: pageSize.toString(),
    pageNumber: pageNumber.toString(),
    sortBy: 'dataType.keyword',
    sortOrder: 'asc',
  });

  if (apiKey) {
    params.append('api_key', apiKey);
  }

  const response = await fetch(`${USDA_BASE_URL}/foods/search?${params}`, {
    cache: 'force-cache',
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
    cache: 'force-cache',
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`USDA API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Extract macronutrients from USDA food item
 */
export function extractMacros(food: USDAFoodItem) {
  const nutrients = food.foodNutrients || [];
  
  const getNutrient = (name: string): number => {
    const nutrient = nutrients.find(n => n.nutrientName === name);
    return nutrient ? nutrient.value : 0;
  };

  return {
    calories: getNutrient('Energy'),
    protein: getNutrient('Protein'),
    carbs: getNutrient('Carbohydrate, by difference'),
    fat: getNutrient('Total lipid (fat)'),
    fiber: getNutrient('Fiber, total dietary'),
    sugar: getNutrient('Sugars, total including NLEA'),
  };
}
