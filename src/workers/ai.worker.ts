/**
 * Local AI Web Worker (v3)
 * 
 * Handles Transformers.js v3 inference with WebGPU support.
 * Offloads heavy classification and embedding generation to the browser's GPU.
 */

import { pipeline, env } from '@huggingface/transformers';

// Configure environment for WebGPU and browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// Force WebGPU if available
if ((navigator as any).gpu && env.backends?.onnx?.wasm) {
  (env.backends.onnx.wasm as any).proxy = false;
}

let classifier: any = null;
let embedder: any = null;

// Initialize the model with WebGPU device if possible
async function getClassifier() {
  if (classifier) return classifier;
  
  try {
    // Attempt to use Moondream2 for high-quality vision analysis if WebGPU is available
    if ((navigator as any).gpu) {
      console.log('WebGPU detected, loading Moondream2...');
      classifier = await pipeline('image-to-text', 'onnx-community/moondream2', {
        device: 'webgpu',
      });
      return classifier;
    }
    
    // Fallback to MobileNet v2 for WASM
    console.log('WebGPU not detected, falling back to MobileNet v2 (WASM)');
    classifier = await pipeline('image-classification', 'onnx-community/mobilenetv2-1.0-224', {
      device: 'wasm',
    });
    return classifier;
  } catch (err) {
    console.warn('Advanced model initialization failed, falling back to basic MobileNet', err);
    classifier = await pipeline('image-classification', 'onnx-community/mobilenetv2-1.0-224', {
      device: 'wasm',
    });
    return classifier;
  }
}

async function getEmbedder() {
  if (embedder) return embedder;
  
  try {
    // all-MiniLM-L6-v2 is small (23MB) and efficient for embeddings
    embedder = await pipeline('feature-extraction', 'xenova/all-MiniLM-L6-v2', {
      device: (navigator as any).gpu ? 'webgpu' : 'wasm',
    });
    return embedder;
  } catch (err) {
    console.warn('WebGPU initialization failed for embedder, falling back to WASM', err);
    embedder = await pipeline('feature-extraction', 'xenova/all-MiniLM-L6-v2', {
      device: 'wasm',
    });
    return embedder;
  }
}

/**
 * Find the closest macro match for a label
 * Returns per-100g macros for common items
 */
function getMacrosForLabel(label: string): { calories: number; protein: number; carbs: number; fat: number } | null {
  const lowercaseLabel = label.toLowerCase();
  
  // Hardcoded core dataset for fast matching in the worker
  const coreFoods: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
    'apple': { calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
    'banana': { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    'chicken': { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    'egg': { calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6 },
    'oatmeal': { calories: 71, protein: 2.5, carbs: 12, fat: 1.4 },
    'milk': { calories: 50, protein: 3.3, carbs: 4.8, fat: 2 },
    'avocado': { calories: 160, protein: 2, carbs: 8.5, fat: 14.7 },
    'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    'salmon': { calories: 208, protein: 22, carbs: 0, fat: 13 },
    'peanut butter': { calories: 588, protein: 25, carbs: 20, fat: 50 },
    'bread': { calories: 265, protein: 9, carbs: 49, fat: 3.2 },
    'steak': { calories: 271, protein: 27, carbs: 0, fat: 18 },
    'broccoli': { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 },
    'potato': { calories: 77, protein: 2, carbs: 17, fat: 0.1 },
    'yogurt': { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
  };

  // Simple substring match
  for (const [key, macros] of Object.entries(coreFoods)) {
    if (lowercaseLabel.includes(key)) return macros;
  }

  return null;
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
  const { type, image, text } = event.data;

  if (type === 'classify') {
    try {
      const model = await getClassifier();
      let results: any[] = [];
      
      if (model.task === 'image-to-text') {
        // Moondream2 / VQA path
        console.log('Using Moondream2 for VQA...');
        const prompt = "Describe the food items in this image and estimate their weight in grams. Format: Item (Weight)";
        const output = await model(image, prompt);
        const generatedText = Array.isArray(output) ? output[0].generated_text : output.generated_text;
        
        // Simple parser for "Item (Weight)"
        const lines = generatedText.split('\n');
        results = lines.map((line: string) => {
          const match = line.match(/(.+)\s*\((\d+)g\)/);
          if (match) {
            const label = match[1].trim();
            const weight = parseInt(match[2]);
            const macros = getMacrosForLabel(label);
            return {
              label,
              score: 0.95, // High confidence for Moondream2
              weight,
              macros: macros ? {
                calories: (macros.calories * weight) / 100,
                protein: (macros.protein * weight) / 100,
                carbs: (macros.carbs * weight) / 100,
                fat: (macros.fat * weight) / 100,
              } : null
            };
          }
          return null;
        }).filter(Boolean);

        // If parser failed, return the raw text as a single label
        if (results.length === 0) {
          results = [{ label: generatedText, score: 0.9, macros: null }];
        }
      } else {
        // MobileNet fallback
        const rawResults = await model(image);
        results = rawResults.map((res: { label: string; score: number }) => ({
          ...res,
          macros: getMacrosForLabel(res.label)
        }));
      }

      self.postMessage({ type: 'results', results });
    } catch (error) {
      console.error('Worker: classification failed', error);
      self.postMessage({ type: 'error', error: String(error) });
    }
  } else if (type === 'embed') {
    try {
      const model = await getEmbedder();
      const output = await model(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      self.postMessage({ type: 'embedding', embedding, text });
    } catch (error) {
      console.error('Worker: embedding generation failed', error);
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
};
