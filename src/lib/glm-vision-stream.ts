/**
 * GLM-4.6V-Flash Vision AI Integration (Streaming)
 *
 * Uses Vercel AI SDK for streaming responses.
 * This avoids Vercel's timeout limits by keeping the connection active.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { z } from 'zod';

/**
 * Create OpenAI-compatible provider for Zhipu GLM
 */
const glm = createOpenAI({
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.GLM_API_KEY,
});

/**
 * Zod schema for structured AI response
 */
const FoodAnalysisSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Food item name'),
      calories: z.number().describe('Calories in kcal'),
      protein_g: z.number().describe('Protein in grams'),
      carbs_g: z.number().describe('Carbohydrates in grams'),
      fat_g: z.number().describe('Fat in grams'),
      confidence: z.number().describe('Confidence score 0-1'),
      portion_guess: z.string().describe('Estimated portion size'),
      notes: z
        .string()
        .optional()
        .describe('Brief explanation of estimation (e.g., "Visible oil sheen suggests higher fat")'),
    })
  ),
});

/**
 * Analyze food image with streaming
 *
 * @param imageUrl - Public URL of the food image
 * @param mealTypeHint - Optional meal type hint
 * @param recentFoods - Optional array of recently eaten foods with frequency data
 * @returns AsyncIterableStream of the analysis
 */
export function analyzeFoodImageStream(
  imageUrl: string,
  mealTypeHint?: string | null,
  recentFoods?: Array<{ name: string; freq: number }>
) {
  const apiKey = process.env.GLM_API_KEY;

  if (!apiKey) {
    throw new Error('GLM_API_KEY not configured');
  }

  // Build meal type context
  const mealTypeContext =
    mealTypeHint && mealTypeHint !== 'unclassified'
      ? `The user is currently eating ${mealTypeHint}. Focus on foods typical for this meal (e.g., eggs, toast, cereal for breakfast; sandwich, salad for lunch; pasta, rice, meat for dinner).`
      : '';

  // Build recent foods context with frequency weighting
  const recentFoodsContext =
    recentFoods && recentFoods.length > 0
      ? `The user frequently eats these foods (with frequency in parentheses): ${recentFoods
          .map((f) => `${f.name} (${f.freq}x)`)
          .join(
            ', '
          )}. When the image is ambiguous, bias your identification toward these familiar foods. For example, if you see a grain-based food and the user frequently eats "Sourdough", prefer that identification over generic "White Bread".`
      : '';

  return streamObject({
    model: glm('glm-4v-flash'),
    schema: FoodAnalysisSchema,
    messages: [
      {
        role: 'system',
        content: `You are a nutritionist AI. Analyze the food image. Return ONLY valid JSON matching the schema. No markdown. No explanations. If unsure, estimate conservatively. Set confidence < 0.5 if unclear. ${mealTypeContext} ${recentFoodsContext}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this food image and provide nutritional information for each visible food item. ${mealTypeContext ? 'Consider the meal type context when identifying foods.' : ''} ${recentFoodsContext ? 'Use the user\'s eating habits to make more personalized identifications.' : ''}`,
          },
          {
            type: 'image',
            image: imageUrl,
          },
        ],
      },
    ],
    temperature: 0.1,
  });
}

/**
 * Analyze food description text with streaming
 *
 * @param text - Food description (e.g., "I had a 10oz steak and some mashed potatoes")
 * @param mealTypeHint - Optional meal type hint
 * @param recentFoods - Optional array of recently eaten foods with frequency data
 * @returns AsyncIterableStream of the analysis
 */
export function analyzeFoodTextStream(
  text: string,
  mealTypeHint?: string | null,
  recentFoods?: Array<{ name: string; freq: number }>
) {
  const apiKey = process.env.GLM_API_KEY;

  if (!apiKey) {
    throw new Error('GLM_API_KEY not configured');
  }

  // Build meal type context
  const mealTypeContext =
    mealTypeHint && mealTypeHint !== 'unclassified'
      ? `The user is currently eating ${mealTypeHint}.`
      : '';

  // Build recent foods context with frequency weighting
  const recentFoodsContext =
    recentFoods && recentFoods.length > 0
      ? `The user frequently eats these foods: ${recentFoods
          .map((f) => f.name)
          .join(', ')}.`
      : '';

  return streamObject({
    model: glm('glm-4-flash'),
    schema: FoodAnalysisSchema,
    messages: [
      {
        role: 'system',
        content: `You are a nutritionist AI. Analyze the food description text and return the nutritional info for each item. Return ONLY valid JSON matching the schema. ${mealTypeContext} ${recentFoodsContext}`,
      },
      {
        role: 'user',
        content: `I ate: ${text}`,
      },
    ],
    temperature: 0.1,
  });
}

/**
 * Calculate average confidence score from analysis results
 */
export function calculateAverageConfidence(
  items: Array<{ confidence: number }>
): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + item.confidence, 0);
  return total / items.length;
}

/**
 * Convert AI response to database insert format
 */
export function convertToLogItems(
  items: Array<{
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: number;
  }>
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
    source: 'AI_ESTIMATE',
  }));
}
