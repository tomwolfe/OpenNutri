/**
 * Local AI Inference Service
 * 
 * Powered by Transformers.js for on-device food classification.
 * Reduces latency, costs, and improves privacy for simple tasks.
 */

import { pipeline } from '@xenova/transformers';

let classifier: any = null;

/**
 * Initialize the food classifier model
 * Uses a lightweight quantized model for browser performance
 */
export async function initLocalClassifier() {
  if (classifier) return classifier;
  
  try {
    // Using a general image classification model that performs well on food
    // In production, you would use a specialized food-101 model
    classifier = await pipeline('image-classification', 'Xenova/mobilenet_v1_1.0_224_quantized');
    return classifier;
  } catch (error) {
    console.error('Failed to initialize local AI:', error);
    return null;
  }
}

/**
 * Classify a food image locally
 * @param image - ImageData from canvas or image URL
 * @returns Array of classifications with labels and scores
 */
export async function classifyFoodLocally(image: any) {
  const model = await initLocalClassifier();
  if (!model) return null;

  try {
    const results = await model(image);
    return results;
  } catch (error) {
    console.error('Local classification failed:', error);
    return null;
  }
}

/**
 * Determine if an image needs cloud AI analysis
 * @param localResults - Results from local classification
 * @returns boolean
 */
export function needsCloudAnalysis(localResults: any[] | null): boolean {
  if (!localResults || localResults.length === 0) return true;
  
  // If top result confidence is low (< 60%), send to cloud for better accuracy
  const topResult = localResults[0];
  if (topResult.score < 0.6) return true;
  
  // If results are ambiguous (top 2 are very close), send to cloud
  if (localResults.length > 1) {
    const diff = topResult.score - localResults[1].score;
    if (diff < 0.2) return true;
  }

  return false;
}
