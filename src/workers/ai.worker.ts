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

// Initialize the model with WebGPU device if possible
async function getClassifier() {
  if (classifier) return classifier;
  
  try {
    // MobileNet v2 is lightweight and supports WebGPU well
    classifier = await pipeline('image-classification', 'onnx-community/mobilenetv2-1.0-224', {
      device: navigator.gpu ? 'webgpu' : 'wasm',
    });
    return classifier;
  } catch (err) {
    console.warn('WebGPU initialization failed, falling back to WASM', err);
    classifier = await pipeline('image-classification', 'onnx-community/mobilenetv2-1.0-224', {
      device: 'wasm',
    });
    return classifier;
  }
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
      const model = await getClassifier() as (image: unknown) => Promise<Array<{ label: string; score: number }>>;
      const rawResults = await model(image);
      
      // Enrich results with macro estimates
      const results = rawResults.map((res: { label: string; score: number }) => ({
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
