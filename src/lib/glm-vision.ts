/**
 * GLM-4.6V-Flash Vision AI Integration
 *
 * Handles communication with Zhipu GLM Vision API for food recognition.
 * Implements semantic caching to reduce API calls.
 */

import { db } from '@/lib/db';
import { logItems, aiJobs } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Create SHA256 hash using Web Crypto API
 * @param text - Text to hash
 * @returns Hex string of hash
 */
async function hashString(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GLM API Configuration
 */
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_MODEL = 'glm-4v-flash'; // Vision-capable model

/**
 * Vision AI Response Schema
 */
interface VisionAnalysisResult {
  items: Array<{
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: number;
    portion_guess: string;
  }>;
}

/**
 * Create a semantic hash of food description for caching
 * @param description - Food description to hash
 * @returns SHA256 hash string
 */
export async function createFoodHash(description: string): Promise<string> {
  // Normalize: lowercase, remove extra spaces, strip common modifiers
  const normalized = description
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return await hashString(normalized);
}

/**
 * Create hash of image URL for cache lookup
 * @param imageUrl - Image URL to hash
 * @returns SHA256 hash string
 */
export async function createImageHash(imageUrl: string): Promise<string> {
  return await hashString(imageUrl);
}

/**
 * Check if food item exists in cache (previous AI analyses)
 * @param foodHash - Hash of food description
 * @returns Cached item or null
 */
export async function getCachedFoodItem(
  foodHash: string
): Promise<Omit<typeof logItems.$inferSelect, 'id' | 'logId'> | null> {
  // Search for previously analyzed items with same hash
  // This is a simplified cache - in production, use Redis
  const [cached] = await db
    .select()
    .from(logItems)
    .where(eq(logItems.foodName, foodHash))
    .limit(1);

  if (cached) {
    return {
      foodName: cached.foodName,
      calories: cached.calories,
      protein: cached.protein,
      carbs: cached.carbs,
      fat: cached.fat,
      source: 'USER_CACHE',
    };
  }

  return null;
}

/**
 * Check if image analysis exists in AI jobs cache
 * @param imageHash - Hash of image URL
 * @returns Cached analysis result or null
 */
export async function getCachedImageAnalysis(
  imageHash: string
): Promise<VisionAnalysisResult | null> {
  // Find completed jobs with this image hash and cached analysis
  const [cachedJob] = await db
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.imageHash, imageHash),
        eq(aiJobs.status, 'completed'),
        eq(aiJobs.cachedAnalysis, sql`IS NOT NULL`)
      )
    )
    .orderBy(aiJobs.completedAt)
    .limit(1);

  if (cachedJob?.cachedAnalysis) {
    try {
      return JSON.parse(cachedJob.cachedAnalysis) as VisionAnalysisResult;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Save analysis result to cache
 * @param imageHash - Hash of image URL
 * @param result - Analysis result to cache
 * @returns True if saved successfully
 */
export async function saveAnalysisToCache(
  imageHash: string,
  result: VisionAnalysisResult
): Promise<boolean> {
  try {
    // Update any pending/processing job with this image hash
    await db
      .update(aiJobs)
      .set({
        imageHash,
        cachedAnalysis: JSON.stringify(result),
      })
      .where(
        and(
          eq(aiJobs.imageHash, imageHash),
          eq(aiJobs.cachedAnalysis, sql`IS NULL`)
        )
      );

    return true;
  } catch (error) {
    console.error('Failed to save analysis cache:', error);
    return false;
  }
}

/**
 * Call GLM Vision API to analyze food image
 * @param imageUrl - Public URL of the food image
 * @returns Analysis result or null on error
 */
export async function analyzeFoodImage(
  imageUrl: string
): Promise<VisionAnalysisResult | null> {
  const apiKey = process.env.GLM_API_KEY;

  if (!apiKey) {
    console.error('GLM_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a nutritionist AI. Analyze the food image. Return ONLY valid JSON. No markdown. No explanations. Schema: { "items": [{ "name": "string", "calories": int, "protein_g": float, "carbs_g": float, "fat_g": float, "confidence": float, "portion_guess": "string" }] } If unsure, estimate conservatively. Set confidence < 0.5 if unclear.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this food image and provide nutritional information for each visible food item.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1, // Low temperature for consistent results
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GLM API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in GLM response');
      return null;
    }

    // Parse JSON response
    try {
      // Remove markdown code blocks if present
      const jsonContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const result: VisionAnalysisResult = JSON.parse(jsonContent);

      // Validate response structure
      if (!result.items || !Array.isArray(result.items)) {
        console.error('Invalid GLM response structure');
        return null;
      }

      return result;
    } catch (parseError) {
      console.error('Failed to parse GLM JSON response:', parseError);
      return null;
    }
  } catch (error) {
    console.error('GLM API request failed:', error);
    return null;
  }
}

/**
 * Calculate average confidence score from analysis results
 * @param items - Array of analyzed items
 * @returns Average confidence (0-1)
 */
export function calculateAverageConfidence(
  items: VisionAnalysisResult['items']
): number {
  if (items.length === 0) return 0;

  const total = items.reduce((sum, item) => sum + (item.confidence || 0), 0);
  return total / items.length;
}

/**
 * Convert GLM response to database insert format
 * @param items - GLM analysis results
 * @returns Array of log items ready for insertion
 */
export function convertToLogItems(
  items: VisionAnalysisResult['items']
): Array<{
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}> {
  return items.map((item) => ({
    foodName: item.name,
    calories: item.calories,
    protein: item.protein_g,
    carbs: item.carbs_g,
    fat: item.fat_g,
    source: item.confidence >= 0.8 ? 'AI_ESTIMATE' : 'AI_ESTIMATE',
  }));
}
