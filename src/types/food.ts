import { z } from 'zod';

// Schema matching the GLM vision response
export const FoodAnalysisSchema = z.object({
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
      usdaMatch: z.object({
        fdcId: z.number(),
        description: z.string()
      }).optional(),
      source: z.string().optional()
    })
  ),
});

export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

export interface DraftItem {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  servingGrams: number;
  isEnhancing?: boolean;
  notes?: string;
  usdaMatch?: { 
    fdcId: number; 
    description: string;
    similarity?: number;
  };
  alternatives?: Array<{
    fdcId: number;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    similarity: number;
  }>;
}

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'unclassified', label: 'Other' },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]['value'];
