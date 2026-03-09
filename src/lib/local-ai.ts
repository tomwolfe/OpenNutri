/**
 * Local AI Inference Service
 *
 * Proxies inference requests to a background Web Worker (Transformers.js).
 * Reduces main-thread load and avoids native module build errors.
 */

export interface ImageClassificationResult {
  label: string;
  score: number;
  macros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface DeviceInfo {
  type: 'webgpu' | 'webgpu-limited' | 'wasm' | 'none';
  name?: string;
  limits?: {
    maxComputeWorkgroupStorageSize: number;
    maxBufferSize: number;
  };
}

export interface ProgressUpdate {
  message: string;
  progress: number; // 0-1
}

let worker: Worker | null = null;
let classificationPromise: ((results: ImageClassificationResult[]) => void) | null = null;
let progressCallback: ((update: ProgressUpdate) => void) | null = null;
let deviceInfoCallback: ((info: DeviceInfo) => void) | null = null;

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
      const { type } = event.data;
      
      if (type === 'results' && classificationPromise) {
        classificationPromise(event.data.results as ImageClassificationResult[]);
        classificationPromise = null;
      } else if (type === 'progress' && progressCallback) {
        progressCallback(event.data as ProgressUpdate);
      } else if (type === 'device-info' && deviceInfoCallback) {
        deviceInfoCallback(event.data.info as DeviceInfo);
      }
    };

    return worker;
  } catch (error) {
    console.error('Failed to create AI worker:', error);
    return null;
  }
}

/**
 * Set progress callback for model loading updates
 */
export function onProgress(callback: (update: ProgressUpdate) => void) {
  progressCallback = callback;
}

/**
 * Set device info callback
 */
export function onDeviceInfo(callback: (info: DeviceInfo) => void) {
  deviceInfoCallback = callback;
  // Request immediate update if worker already initialized
  if (worker) {
    worker.postMessage({ type: 'get-device-info' });
  }
}

/**
 * Classify a food image using the background worker
 * @param image - Image URL or ImageData
 * @returns Promise with results
 */
export async function classifyFoodLocally(image: string | ImageData): Promise<ImageClassificationResult[] | null> {
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
export function needsCloudAnalysis(localResults: ImageClassificationResult[] | null): boolean {
  if (!localResults || localResults.length === 0) return true;
  
  const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  const topResult = localResults[0];
  
  // If we have WebGPU, we assume Moondream2 was used, which is significantly more accurate.
  if (hasWebGPU) {
    // If we have even one result with decent score from Moondream2, skip cloud
    return topResult.score < 0.7;
  }

  // MobileNet fallback (conservative)
  if (topResult.score < 0.8) return true;
  
  if (localResults.length > 1) {
    const diff = topResult.score - localResults[1].score;
    if (diff < 0.3) return true;
  }

  return false;
}
