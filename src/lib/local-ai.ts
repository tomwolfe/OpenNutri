/**
 * Local AI Inference Service
 *
 * Proxies inference requests to a background Web Worker (Transformers.js).
 * Reduces main-thread load and avoids native module build errors.
 * 
 * Task 1.4: Enhanced with detailed progress tracking and device capability reporting
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
    maxStorageBufferBindingSize: number;
  };
  features?: string[];
  isMobile?: boolean;
}

export interface ProgressUpdate {
  message: string;
  progress: number; // 0-1
  stage?: 'downloading' | 'loading-fallback' | 'loading-embedder' | 'ready' | 'fallback' | 'error' | 'ready-limited';
  details?: any;
}

let worker: Worker | null = null;
let classificationPromise: ((results: ImageClassificationResult[]) => void) | null = null;
let embeddingPromise: ((embedding: number[]) => void) | null = null;
let progressCallback: ((update: ProgressUpdate) => void) | null = null;
let deviceInfoCallback: ((info: DeviceInfo) => void) | null = null;
let modelStateCallback: ((state: { classifierState: string; embedderState: string; deviceInfo: DeviceInfo }) => void) | null = null;

/**
 * Initialize the AI Web Worker with enhanced event handling
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
      } else if (type === 'embedding' && embeddingPromise) {
        embeddingPromise(event.data.embedding);
        embeddingPromise = null;
      } else if (type === 'progress' && progressCallback) {
        progressCallback(event.data as ProgressUpdate);
      } else if (type === 'device-info' && deviceInfoCallback) {
        deviceInfoCallback(event.data.info as DeviceInfo);
      } else if (type === 'model-state' && modelStateCallback) {
        modelStateCallback(event.data as { classifierState: string; embedderState: string; deviceInfo: DeviceInfo });
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
 * Task 1.4: Enhanced progress tracking with stages
 */
export function onProgress(callback: (update: ProgressUpdate) => void) {
  progressCallback = callback;
}

/**
 * Set device info callback
 * Task 1.4: Real-time device capability reporting
 */
export function onDeviceInfo(callback: (info: DeviceInfo) => void) {
  deviceInfoCallback = callback;
  // Request immediate update if worker already initialized
  if (worker) {
    worker.postMessage({ type: 'get-device-info' });
  }
}

/**
 * Set model state callback for tracking loading states
 */
export function onModelState(callback: (state: { classifierState: string; embedderState: string; deviceInfo: DeviceInfo }) => void) {
  modelStateCallback = callback;
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
 * Generate embedding for text using the background worker
 * Task 1.5: Local semantic cache support
 */
export async function generateEmbeddingLocally(text: string): Promise<number[] | null> {
  const aiWorker = getAiWorker();
  if (!aiWorker) return null;

  return new Promise((resolve) => {
    embeddingPromise = resolve;
    aiWorker.postMessage({ type: 'embed', text });
  });
}

/**
 * Get current device info
 * Task 1.4: On-demand device capability query
 */
export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  const aiWorker = getAiWorker();
  if (!aiWorker) return null;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'device-info') {
        aiWorker!.removeEventListener('message', handler);
        resolve(event.data.info as DeviceInfo);
      }
    };
    
    aiWorker.addEventListener('message', handler);
    aiWorker.postMessage({ type: 'get-device-info' });
    
    // Timeout after 2 seconds
    setTimeout(() => {
      aiWorker!.removeEventListener('message', handler);
      resolve(null);
    }, 2000);
  });
}

/**
 * Get current model loading state
 */
export async function getModelState(): Promise<{ classifierState: string; embedderState: string; deviceInfo: DeviceInfo } | null> {
  const aiWorker = getAiWorker();
  if (!aiWorker) return null;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'model-state') {
        aiWorker!.removeEventListener('message', handler);
        resolve(event.data as { classifierState: string; embedderState: string; deviceInfo: DeviceInfo });
      }
    };
    
    aiWorker.addEventListener('message', handler);
    aiWorker.postMessage({ type: 'get-model-state' });
  });
}

/**
 * Preload models for faster first inference
 * Task 1.5: Lazy loading with preloading support
 */
export async function preloadModels(): Promise<void> {
  const aiWorker = getAiWorker();
  if (!aiWorker) return;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'progress' && event.data.stage === 'ready') {
        aiWorker!.removeEventListener('message', handler);
        resolve();
      }
    };
    
    aiWorker.addEventListener('message', handler);
    // Trigger model loading by requesting a dummy classification
    aiWorker.postMessage({ type: 'classify', image: null });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      aiWorker!.removeEventListener('message', handler);
      resolve();
    }, 30000);
  });
}

/**
 * Determine if an image needs cloud AI analysis
 * Task 1.4: Smarter fallback logic based on device capabilities
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

/**
 * Get recommended model based on device capabilities
 * Task 1.5: Device-optimized model selection
 */
export async function getRecommendedModel(): Promise<'moondream2' | 'mobilenet' | null> {
  const info = await getDeviceInfo();
  
  if (!info) return null;
  
  if (info.type === 'webgpu' && !info.isMobile) {
    return 'moondream2'; // Full model for desktop WebGPU
  } else if (info.type === 'webgpu' && info.isMobile) {
    return 'moondream2'; // Mobile WebGPU can handle Moondream2
  } else {
    return 'mobilenet'; // WASM fallback for all other devices
  }
}
