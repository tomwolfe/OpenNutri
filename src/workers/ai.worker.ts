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

// Initialize the model
async function getClassifier() {
  if (classifier) return classifier;
  
  classifier = await pipeline('image-classification', 'Xenova/mobilenet_v1_1.0_224_quantized');
  return classifier;
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
  const { type, image } = event.data;

  if (type === 'classify') {
    try {
      const model = await getClassifier();
      const results = await model(image);
      self.postMessage({ type: 'results', results });
    } catch (error) {
      console.error('Worker: classification failed', error);
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
};
