/**
 * Local AI Inference Service
 * 
 * Proxies inference requests to a background Web Worker (Transformers.js).
 * Reduces main-thread load and avoids native module build errors.
 */

let worker: Worker | null = null;
let classificationPromise: ((results: any) => void) | null = null;

/**
 * Initialize the AI Web Worker
 */
export function getAiWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (worker) return worker;
  
  try {
    worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
      type: 'module',
    });
    
    worker.onmessage = (event) => {
      if (event.data.type === 'results' && classificationPromise) {
        classificationPromise(event.data.results);
        classificationPromise = null;
      }
    };
    
    return worker;
  } catch (error) {
    console.error('Failed to create AI worker:', error);
    return null;
  }
}

/**
 * Classify a food image using the background worker
 * @param image - Image URL or ImageData
 * @returns Promise with results
 */
export async function classifyFoodLocally(image: any): Promise<any[] | null> {
  const aiWorker = getAiWorker();
  if (!aiWorker) return null;

  return new Promise((resolve) => {
    classificationPromise = resolve;
    aiWorker.postMessage({ type: 'classify', image });
  });
}

/**
 * Determine if an image needs cloud AI analysis
 */
export function needsCloudAnalysis(localResults: any[] | null): boolean {
  if (!localResults || localResults.length === 0) return true;
  
  const topResult = localResults[0];
  if (topResult.score < 0.6) return true;
  
  if (localResults.length > 1) {
    const diff = topResult.score - localResults[1].score;
    if (diff < 0.2) return true;
  }

  return false;
}
