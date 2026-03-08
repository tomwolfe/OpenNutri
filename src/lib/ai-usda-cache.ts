/**
 * In-Memory LRU Cache for AI-to-USDA Mappings
 *
 * Caches common AI food name to USDA food item mappings
 * to make the enhancement near-instant for repeated queries.
 *
 * Can be upgraded to Vercel KV or Redis for multi-instance deployments.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private maxAge: number;
  private maxSize: number;

  constructor(maxSize: number = 1000, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMs; // Default: 7 days
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Delete oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    const keysToDelete: K[] = [];
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.maxAge) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      removed++;
    });

    return removed;
  }
}

// Global cache instance (singleton pattern for Next.js)
const globalCache = globalThis as unknown as {
  aiUsdaCache?: LRUCache<string, number>;
};

if (!globalCache.aiUsdaCache) {
  globalCache.aiUsdaCache = new LRUCache<string, number>(1000, 7 * 24 * 60 * 60 * 1000);
}

export const aiUsdaCache = globalCache.aiUsdaCache;

/**
 * Normalize food name for cache key
 * Removes cooking methods and standardizes the name
 */
function normalizeFoodName(foodName: string): string {
  return foodName
    .toLowerCase()
    .replace(/\b(?:grilled|fried|baked|roasted|steamed|boiled|pan-fried|deep-fried)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Get cached USDA FDC ID for an AI-detected food name
 */
export function getCachedUSDAMatch(foodName: string): number | null {
  const normalizedKey = normalizeFoodName(foodName);
  return aiUsdaCache.get(normalizedKey);
}

/**
 * Cache a USDA FDC ID for an AI-detected food name
 */
export function cacheUSDAMatch(foodName: string, fdcId: number): void {
  const normalizedKey = normalizeFoodName(foodName);
  aiUsdaCache.set(normalizedKey, fdcId);
}

/**
 * Get cache statistics (for debugging/monitoring)
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
} {
  return {
    size: aiUsdaCache.size(),
    maxSize: 1000,
  };
}

/**
 * Run cache cleanup (remove expired entries)
 * Call this periodically (e.g., in a cron job)
 */
export function cleanupCache(): number {
  return aiUsdaCache.cleanup();
}
