/**
 * Text Embeddings Service
 * 
 * Generates vector embeddings for semantic food matching.
 * Uses Zhipu GLM embedding API (same provider as vision).
 */
import { generateEmbeddingInWorker } from './worker-client';

/**
 * Generate embedding vector for a text string
 * Uses Local Transformers.js in browser, GLM API on server.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use Web Worker in browser for local-first, zero-cost embeddings
  if (typeof window !== 'undefined') {
    try {
      return await generateEmbeddingInWorker(text);
    } catch (err) {
      console.warn('Local embedding failed, falling back to API', err);
    }
  }

  const apiKey = process.env.GLM_API_KEY;

  if (!apiKey) {
// ... (rest of function)

    console.warn('GLM_API_KEY not configured, returning zero vector');
    return new Array(1024).fill(0);
  }

  try {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-embed',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || new Array(1024).fill(0);
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    // Return zero vector as fallback
    return new Array(1024).fill(0);
  }
}

/**
 * Convert embedding array to pgvector format
 */
export function toVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Clean food description for better embedding quality
 * Removes cooking methods and focuses on core food identity
 */
export function cleanFoodDescription(description: string): string {
  return description
    .replace(/\b(grilled|fried|baked|roasted|steamed|boiled|poached|sautéed)\b/gi, '')
    .replace(/\b(with|in|and|of|for)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
