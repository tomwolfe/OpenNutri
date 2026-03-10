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
      usdaMatch: z.object({
        fdcId: z.number(),
        description: z.string()
      }).optional(),
      source: z.string().optional()
    })
  ),
});

export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

export interface Micronutrients {
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  vitaminC?: number;
  saturatedFat?: number;
  cholesterol?: number;
}

export interface DraftItem {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients?: Micronutrients;
  source: string;
  servingGrams: number;
  numericQuantity?: number;
  unit?: string;
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
    micronutrients?: Micronutrients;
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
