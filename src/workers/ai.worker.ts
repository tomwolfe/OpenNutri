/**
 * Local AI Web Worker
 * 
 * Handles Transformers.js inference in a background thread to keep UI responsive
 * and isolate native module dependencies.
 */

import { pipeline, env } from '@xenova/transformers';

// Configure environment for worker/browser
env.allowLocalModels = false;
env.useBrowserCache = true;

let classifier: any = null;

/**
 * Local Macro Database for Common Foods
 * (Averages for standard portion sizes)
 */
const FOOD_MACROS: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  'apple': { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  'banana': { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  'orange': { calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  'chicken breast': { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, // 100g
  'egg, boiled': { calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3 },
  'broccoli': { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 }, // 100g
  'pizza': { calories: 285, protein: 12, carbs: 36, fat: 10 }, // 1 slice
  'hamburger': { calories: 250, protein: 12, carbs: 31, fat: 9 },
  'coffee': { calories: 2, protein: 0.3, carbs: 0, fat: 0 },
  'avocado': { calories: 160, protein: 2, carbs: 9, fat: 15 }, // 100g
  'rice, white, cooked': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, // 100g
  'yogurt, plain': { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 }, // 100g
};

// Initialize the model
async function getClassifier() {
  if (classifier) return classifier;
  
  // Use a specialized food model if possible, but MobileNet is okay for general categories
  classifier = await pipeline('image-classification', 'Xenova/mobilenet_v1_1.0_224_quantized');
  return classifier;
}

/**
 * Find the closest macro match for a label
 */
function getMacrosForLabel(label: string) {
  const normalized = label.toLowerCase();
  for (const [key, value] of Object.entries(FOOD_MACROS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return null;
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
  const { type, image } = event.data;

  if (type === 'classify') {
    try {
      const model = await getClassifier();
      const rawResults = await model(image);
      
      // Enrich results with macro estimates
      const results = rawResults.map((res: any) => ({
        ...res,
        macros: getMacrosForLabel(res.label)
      }));

      self.postMessage({ type: 'results', results });
    } catch (error) {
      console.error('Worker: classification failed', error);
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
};

