/**
 * @module types
 * @description Type definitions for BunCache options, stats, and events.
 */
export interface BunCacheOptions {
  maxKeys?: number;
  defaultTTL?: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastUsed: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  expirations: number;
}

export interface EventHandlers {
  onExpire?: (key: string, value: unknown) => void;
  onEvict?: (key: string, value: unknown, reason: "lru" | "manual") => void;
  onClear?: () => void;
}
