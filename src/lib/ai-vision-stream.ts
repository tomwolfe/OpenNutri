/**
 * AI Vision & Text Analysis Service (Streaming)
 * 
 * Support for multiple AI providers (Zhipu, OpenAI, Google, Anthropic) via Vercel AI SDK.
 * This avoids Vercel's 10s timeout limits by using streaming responses.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamObject } from 'ai';
import { z } from 'zod';

// Detect AI Provider from environment
const providerName = (process.env.AI_PROVIDER || 'zhipu').toLowerCase();

/**
 * Configure AI Provider based on environment
 */
const getAiProvider = () => {
  // Zhipu GLM (OpenAI Compatible)
  if (providerName === 'zhipu') {
    return createOpenAI({
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY,
    });
  }

  // Google Gemini
  if (providerName === 'google') {
    return createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATION_AI_API_KEY,
    });
  }

  // Anthropic Claude
  if (providerName === 'anthropic') {
    return createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // Standard OpenAI (default)
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

const provider = getAiProvider();

/**
 * Configure AI Model based on provider and capability
 */
const getModels = () => {
  if (providerName === 'zhipu') {
    return {
      vision: 'glm-4v-flash',
      text: 'glm-4-flash',
    };
  }

  if (providerName === 'google') {
    return {
      vision: 'gemini-1.5-flash',
      text: 'gemini-1.5-flash',
    };
  }

  if (providerName === 'anthropic') {
    return {
      vision: 'claude-3-5-sonnet-20240620',
      text: 'claude-3-5-sonnet-20240620',
    };
  }
  
  // Default to GPT-4o-mini (fast and efficient)
  return {
    vision: 'gpt-4o-mini',
    text: 'gpt-4o-mini',
  };
};

const models = getModels();

/**
 * Zod schema for structured AI response
 */
export const FoodAnalysisSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Food item name'),
      calories: z.number().describe('Calories in kcal'),
      protein_g: z.number().describe('Protein in grams'),
      carbs_g: z.number().describe('Carbohydrates in grams'),
      fat_g: z.number().describe('Fat in grams'),
      fiber_g: z.number().optional().describe('Fiber in grams'),
      sugar_g: z.number().optional().describe('Sugar in grams'),
      sodium_mg: z.number().optional().describe('Sodium in milligrams'),
      potassium_mg: z.number().optional().describe('Potassium in milligrams'),
      calcium_mg: z.number().optional().describe('Calcium in milligrams'),
      iron_mg: z.number().optional().describe('Iron in milligrams'),
      vitamin_c_mg: z.number().optional().describe('Vitamin C in milligrams'),
      confidence: z.number().describe('Confidence score 0-1'),
      portion_guess: z.string().describe('Estimated portion size string (e.g., "2 large slices")'),
      numeric_quantity: z.number().describe('Structured numeric quantity (e.g., 2)'),
      unit: z.string().describe('Structured unit (e.g., "slice", "g", "cup", "oz")'),
      notes: z
        .string()
        .optional()
        .describe('Brief explanation of estimation (e.g., "Visible oil sheen suggests higher fat")'),
    })
  ),
});

export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

/**
 * Analyze food image with streaming
 *
 * @param image - Public URL, data URL, or binary data (Uint8Array/ArrayBuffer) of the food image
 * @param mealTypeHint - Optional meal type hint
 * @param recentFoods - Optional array of recently eaten foods with frequency data
 * @returns AsyncIterableStream of the analysis
 */
export function analyzeFoodImageStream(
  image: string | Uint8Array | ArrayBuffer,
  mealTypeHint?: string | null,
  recentFoods?: Array<{ name: string; freq: number }>
) {
  // Build meal type context
  const mealTypeContext =
    mealTypeHint && mealTypeHint !== 'unclassified'
      ? `The user is currently eating ${mealTypeHint}. Focus on foods typical for this meal.`
      : '';

  // Build recent foods context with stronger guidance
  const recentFoodsContext =
    recentFoods && recentFoods.length > 0
      ? `PRIORITY CONTEXT: The user's top ${recentFoods.length} most frequently eaten foods this week are: ${recentFoods.map((f, i) => `${i + 1}. ${f.name} (${f.freq} times)`).join(', ')}. If the image is ambiguous, strongly prefer these foods in your analysis. This helps reduce hallucinations and improves accuracy.`
      : '';

  return streamObject({
    model: provider(models.vision),
    schema: FoodAnalysisSchema,
    messages: [
      {
        role: 'system',
        content: `You are a nutritionist AI analyzing food images. Return ONLY valid JSON matching the schema. If unsure, estimate conservatively. Set confidence < 0.5 if unclear. ${mealTypeContext} ${recentFoodsContext}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this food image. ${mealTypeContext} ${recentFoodsContext}`,
          },
          {
            type: 'image',
            image,
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
 * @param text - Food description
 * @param mealTypeHint - Optional meal type hint
 * @param recentFoods - Optional array of recently eaten foods with frequency data
 * @returns AsyncIterableStream of the analysis
 */
export function analyzeFoodTextStream(
  text: string,
  mealTypeHint?: string | null,
  recentFoods?: Array<{ name: string; freq: number }>
) {
  // Build meal type context
  const mealTypeContext =
    mealTypeHint && mealTypeHint !== 'unclassified'
      ? `The user is currently eating ${mealTypeHint}.`
      : '';

  // Build recent foods context
  const recentFoodsContext =
    recentFoods && recentFoods.length > 0
      ? `The user frequently eats: ${recentFoods.map((f) => f.name).join(', ')}.`
      : '';

  return streamObject({
    model: provider(models.text),
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
