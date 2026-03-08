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
if (navigator.gpu) {
  env.backends.onnx.wasm.proxy = false;
}

let classifier: any = null;
let embedder: any = null;

// Initialize the model with WebGPU device if possible
async function getClassifier() {
  if (classifier) return classifier;
  
  try {
    // Attempt to use Moondream2 for high-quality vision analysis if WebGPU is available
    if (navigator.gpu) {
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
      device: navigator.gpu ? 'webgpu' : 'wasm',
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
 */
// ... (keep getMacrosForLabel)

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
