/**
 * OpenFoodFacts API Client
 * 
 * Fetches nutritional data for packaged goods via barcode.
 * API Documentation: https://openfoodfacts.github.io/api-documentation/
 */

export interface OFFProduct {
  code: string;
  product_name: string;
  nutriments: {
    'energy-kcal_100g'?: number;
    'energy-kcal'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
  image_url?: string;
  brands?: string;
}

export async function getProductByBarcode(barcode: string): Promise<OFFProduct | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === 0 || !data.product) {
      return null;
    }
    
    return data.product;
  } catch (error) {
    console.error('OpenFoodFacts API error:', error);
    return null;
  }
}

/**
 * Maps OFF product to our internal LogItem format
 */
export function mapOFFToLogItem(product: OFFProduct) {
  const nutriments = product.nutriments;
  
  // Use 100g values as base
  const calories = nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0;
  const protein = nutriments.proteins_100g || 0;
  const carbs = nutriments.carbohydrates_100g || 0;
  const fat = nutriments.fat_100g || 0;
  
  return {
    foodName: `${product.product_name}${product.brands ? ` (${product.brands})` : ''}`,
    servingGrams: product.serving_quantity || 100,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    source: 'USDA' as const, // We use USDA as a generic "Verified" source for now
    notes: `Barcode: ${product.code}`,
  };
}
