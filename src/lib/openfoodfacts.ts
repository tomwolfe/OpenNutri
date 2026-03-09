/**
 * OpenFoodFacts API Client
 *
 * Fetches nutritional data for packaged goods via barcode.
 * API Documentation: https://openfoodfacts.github.io/api-documentation/
 *
 * Task 2.4: Enhanced with local caching and multi-language support
 */

import { db } from './db-local';

export interface OFFProduct {
  code: string;
  product_name: string;
  product_name_en?: string;
  product_name_es?: string;
  product_name_fr?: string;
  product_name_de?: string;
  product_name_pt?: string;
  nutriments: {
    'energy-kcal_100g'?: number;
    'energy-kcal'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    salt_100g?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
  image_url?: string;
  image_small_url?: string;
  brands?: string;
  categories?: string;
  countries?: string;
  ecoscore_grade?: string;
  nutriscore_grade?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  additives_n?: number;
  allergens_from_ingredients?: string;
}

export interface OFFSearchResult {
  count: number;
  page: number;
  pageSize: number;
  products: OFFProduct[];
}

/**
 * Get product by barcode with local caching
 * Task 2.4: Cache OFF products in IndexedDB for offline access
 */
export async function getProductByBarcode(barcode: string, language: string = 'en'): Promise<OFFProduct | null> {
  try {
    // Check local cache first
    const cached = await db.offProducts.get(barcode);
    if (cached) {
      // Return cached version if less than 7 days old
      const age = Date.now() - cached.lastFetched;
      if (age < 7 * 24 * 60 * 60 * 1000) {
        console.log('📦 OFF: Using cached product for', barcode);
        return cached.product;
      }
    }

    // Fetch from API with language parameter
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=code,product_name,product_name_en,product_name_es,product_name_fr,product_name_de,product_name_pt,nutriments,serving_size,serving_quantity,image_url,image_small_url,brands,categories,countries,ecoscore_grade,nutriscore_grade,ingredients_text,ingredients_text_en,additives_n,allergens_from_ingredients&lc=${language}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === 0 || !data.product) {
      return null;
    }

    const product = data.product as OFFProduct;

    // Cache the product
    await db.offProducts.put({
      id: barcode,
      product,
      lastFetched: Date.now(),
    });

    console.log('📦 OFF: Fetched and cached product for', barcode);
    return product;
  } catch (error) {
    console.error('OpenFoodFacts API error:', error);
    return null;
  }
}

/**
 * Search products by text query
 * Task 2.4: Add search functionality for packaged foods
 */
export async function searchProducts(query: string, language: string = 'en', page: number = 1): Promise<OFFSearchResult | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page=${page}&page_size=20&lc=${language}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      count: data.count,
      page: data.page,
      pageSize: data.page_size,
      products: data.products || [],
    };
  } catch (error) {
    console.error('OpenFoodFacts search error:', error);
    return null;
  }
}

/**
 * Maps OFF product to our internal LogItem format
 */
export function mapOFFToLogItem(product: OFFProduct, preferredLanguage: string = 'en') {
  const nutriments = product.nutriments;

  // Get product name in preferred language
  const productName = 
    (preferredLanguage === 'es' && product.product_name_es) ||
    (preferredLanguage === 'fr' && product.product_name_fr) ||
    (preferredLanguage === 'de' && product.product_name_de) ||
    (preferredLanguage === 'pt' && product.product_name_pt) ||
    (preferredLanguage === 'en' && product.product_name_en) ||
    product.product_name ||
    'Unknown Product';

  // Use 100g values as base
  const calories = nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0;
  const protein = nutriments.proteins_100g || 0;
  const carbs = nutriments.carbohydrates_100g || 0;
  const fat = nutriments.fat_100g || 0;
  const fiber = nutriments.fiber_100g || 0;
  const sodium = nutriments.sodium_100g || 0;

  const notes = [
    product.brands,
    product.categories,
    product.serving_size,
    product.ecoscore_grade ? `Eco-Score: ${product.ecoscore_grade.toUpperCase()}` : null,
    product.nutriscore_grade ? `Nutri-Score: ${product.nutriscore_grade.toUpperCase()}` : null,
  ].filter(Boolean).join(' • ');

  return {
    foodName: `${productName}${product.brands ? ` (${product.brands})` : ''}`,
    servingGrams: product.serving_quantity || 100,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    sodium: Math.round(sodium * 10) / 10,
    source: 'OpenFoodFacts' as const,
    notes: notes || `Barcode: ${product.code}`,
    metadata: {
      barcode: product.code,
      imageUrl: product.image_small_url || product.image_url,
      brands: product.brands,
      categories: product.categories,
      ecoscore: product.ecoscore_grade,
      nutriscore: product.nutriscore_grade,
      ingredients: product.ingredients_text_en || product.ingredients_text,
      additives: product.additives_n,
    },
  };
}
