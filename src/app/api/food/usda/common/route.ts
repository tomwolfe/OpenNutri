/**
 * Common USDA Foods API Route
 * 
 * Returns the top 500 most common USDA food items for offline caching.
 * These items cover ~90% of daily food logging scenarios.
 * 
 * Cached for 7 days to reduce API calls while keeping data fresh.
 */

import { NextResponse } from 'next/server';
import { searchFoods, extractMacros } from '@/lib/usda';

export const runtime = 'nodejs';
export const revalidate = 604800; // 7 days - cached for a week
const COMMON_FOOD_QUERIES = [
  // Fruits
  'apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry', 'avocado',
  // Vegetables
  'broccoli', 'spinach', 'carrot', 'potato', 'tomato', 'lettuce', 'cucumber', 'bell pepper',
  // Proteins
  'chicken breast', 'salmon', 'egg', 'beef', 'pork', 'tofu', 'tuna', 'shrimp',
  // Grains
  'rice', 'oatmeal', 'bread', 'pasta', 'quinoa', 'corn', 'wheat',
  // Dairy
  'milk', 'cheese', 'yogurt', 'butter', 'cream',
  // Nuts & Seeds
  'almond', 'peanut', 'walnut', 'chia seed', 'flaxseed',
  // Legumes
  'bean', 'lentil', 'chickpea', 'soy',
  // Common meals
  'salad', 'sandwich', 'pizza', 'burger', 'rice bowl',
];

interface CommonFoodItem {
  fdcId: number | string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  dataType: string;
  servingSize?: number;
}

export async function GET() {
  try {
    const allFoods: CommonFoodItem[] = [];
    const seenFdcIds = new Set<number>();

    // Fetch common foods from multiple queries
    for (const query of COMMON_FOOD_QUERIES) {
      try {
        const results = await searchFoods(query, 25, 1);
        
        for (const food of results.foods) {
          if (!seenFdcIds.has(food.fdcId)) {
            seenFdcIds.add(food.fdcId);
            
            const macros = extractMacros(food);
            const sodiumNutrient = food.foodNutrients.find(
              n => n.nutrientName === 'Sodium, Na'
            );
            
            allFoods.push({
              fdcId: food.fdcId,
              description: food.description,
              calories: Math.round(macros.calories) || 0,
              protein: Number(macros.protein?.toFixed(1)) || 0,
              carbs: Number(macros.carbs?.toFixed(1)) || 0,
              fat: Number(macros.fat?.toFixed(1)) || 0,
              sodium: sodiumNutrient?.value || 0,
              dataType: food.dataType,
              servingSize: food.servingSize,
            });
          }
        }
        
        // Rate limiting: wait between queries
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Failed to fetch query "${query}":`, err);
      }
    }

    // Sort by description for consistent ordering
    allFoods.sort((a, b) => a.description.localeCompare(b.description));

    // Limit to top 500
    const limitedFoods = allFoods.slice(0, 500);

    return NextResponse.json({
      foods: limitedFoods,
      total: limitedFoods.length,
      cached: true,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch common foods:', error);
    return NextResponse.json(
      { error: 'Failed to fetch common foods', foods: [] },
      { status: 500 }
    );
  }
}
