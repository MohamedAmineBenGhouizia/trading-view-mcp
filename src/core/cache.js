/**
 * Generation-Aware LRU/TTL Cache.
 * Guarantees zero stale data leaks by binding cached items to the active generation ID.
 * Automatically purges entries when the chart state generation changes.
 */

import { chartStateManager } from './state-manager.js';
import { logDebug } from '../connection.js';

export class GenerationAwareCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSize=100] Maximum entries
   * @param {number} [options.defaultTtlMs=10000] Default TTL (10 seconds)
   */
  constructor({ maxSize = 100, defaultTtlMs = 10000 } = {}) {
    this._maxSize = maxSize;
    this._defaultTtlMs = defaultTtlMs;
    this._cache = new Map();
    this._hits = 0;
    this._misses = 0;

    // Listen to generation bumps to invalidate automatically
    if (chartStateManager && typeof chartStateManager.subscribe === 'function') {
      chartStateManager.subscribe((event, gen) => {
        if (event === 'generation') {
          this.purgeOlderThan(gen);
        }
      });
    }
  }

  /**
   * Builds a canonical cache key incorporating symbol, timeframe, and parameters.
   * @param {string} prefix
   * @param {object} params
   * @returns {string}
   */
  buildKey(prefix, params = {}) {
    const keys = Object.keys(params).sort();
    const parts = keys.map(k => `${k}=${params[k]}`);
    return `${prefix}:${parts.join('&')}`;
  }

  /**
   * Retrieves a cached value if it is not expired and matches current generation.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }

    const currentGen = chartStateManager.getGeneration();
    // Invalidate if generation changed
    if (entry.generation !== currentGen) {
      this._cache.delete(key);
      this._misses++;
      logDebug('CACHE', `Stale generation mismatch on key "${key}" (cached: ${entry.generation}, current: ${currentGen})`);
      return null;
    }

    // Invalidate if TTL expired
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      this._misses++;
      return null;
    }

    // Refresh LRU order
    this._cache.delete(key);
    this._cache.set(key, entry);
    this._hits++;
    return entry.value;
  }

  /**
   * Stores a value in cache tagged with current generation.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs = this._defaultTtlMs) {
    if (this._cache.size >= this._maxSize) {
      // Evict oldest entry
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    this._cache.set(key, {
      value,
      generation: chartStateManager.getGeneration(),
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now(),
    });
  }

  purgeOlderThan(activeGeneration) {
    let purged = 0;
    for (const [key, entry] of this._cache.entries()) {
      if (entry.generation < activeGeneration) {
        this._cache.delete(key);
        purged++;
      }
    }
    if (purged > 0) {
      logDebug('CACHE', `Purged ${purged} stale entries for generation < ${activeGeneration}`);
    }
  }

  clear() {
    this._cache.clear();
  }

  get stats() {
    return {
      size: this._cache.size,
      maxSize: this._maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRatio: (this._hits + this._misses) > 0 ? Math.round((this._hits / (this._hits + this._misses)) * 100) / 100 : 0,
    };
  }
}

export const chartDataCache = new GenerationAwareCache({ maxSize: 150, defaultTtlMs: 15000 });
