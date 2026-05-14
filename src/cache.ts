/**
 * @module cache
 * @description BunCache class — in-memory cache with TTL and LRU eviction.
 */
import type { BunCacheOptions, CacheEntry, CacheStats, EventHandlers } from "./types/index.ts";

const DEFAULT_MAX_KEYS = 1000;
const DEFAULT_TTL = 0;

export class BunCache {
  #store = new Map<string, CacheEntry<unknown>>();
  #maxKeys: number;
  #defaultTTL: number;
  #hasLimit: boolean;
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #expirations = 0;
  #eventHandlers: EventHandlers = {};

  set onExpire(handler: ((key: string, value: unknown) => void) | null) {
    this.#eventHandlers.onExpire = handler ?? undefined;
  }

  set onEvict(handler: ((key: string, value: unknown, reason: "lru" | "manual") => void) | null) {
    this.#eventHandlers.onEvict = handler ?? undefined;
  }

  set onClear(handler: (() => void) | null) {
    this.#eventHandlers.onClear = handler ?? undefined;
  }

  constructor(options: BunCacheOptions = {}) {
    this.#maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
    this.#defaultTTL = options.defaultTTL ?? DEFAULT_TTL;
    this.#hasLimit = this.#maxKeys > 0 && this.#maxKeys < Infinity;
  }

  get size(): number {
    return this.#store.size;
  }

  get stats(): CacheStats {
    const total = this.#hits + this.#misses;
    return {
      size: this.#store.size,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? this.#hits / total : 0,
      evictions: this.#evictions,
      expirations: this.#expirations,
    };
  }

  set<T>(key: string, value: T, ttl?: number): void {
    if (!this.#store.has(key) && this.#hasLimit && this.#store.size >= this.#maxKeys) {
      this.#evictLRU();
    }

    const resolvedTTL = ttl ?? this.#defaultTTL;
    const expiresAt = resolvedTTL > 0 ? performance.now() + resolvedTTL : 0;

    this.#store.set(key, {
      value,
      expiresAt,
      lastUsed: this.#hasLimit ? performance.now() : 0,
    } as CacheEntry<unknown>);
  }

  get<T>(key: string): T | undefined {
    const entry = this.#store.get(key);
    if (!entry) {
      this.#misses++;
      return undefined;
    }

    if (entry.expiresAt !== 0 && performance.now() > entry.expiresAt) {
      this.#store.delete(key);
      this.#expirations++;
      this.#misses++;
      try {
        this.#eventHandlers.onExpire?.(key, entry.value);
      } catch {
        // handler error — cache state already consistent
      }
      return undefined;
    }

    this.#hits++;
    if (this.#hasLimit) {
      entry.lastUsed = performance.now();
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.#store.get(key);
    if (!entry) return false;

    if (entry.expiresAt !== 0 && performance.now() > entry.expiresAt) {
      this.#store.delete(key);
      this.#expirations++;
      try {
        this.#eventHandlers.onExpire?.(key, entry.value);
      } catch {
        // handler error — cache state already consistent
      }
      return false;
    }

    return true;
  }

  remainingTTL(key: string): number {
    const entry = this.#store.get(key);
    if (!entry) return -1;

    if (entry.expiresAt === 0) return -1;

    const remaining = entry.expiresAt - performance.now();
    return remaining > 0 ? remaining : -1;
  }

  delete(key: string): boolean {
    const entry = this.#store.get(key);
    if (!entry) return false;

    this.#store.delete(key);
    try {
      this.#eventHandlers.onEvict?.(key, entry.value, "manual");
    } catch {
      // handler error — cache state already consistent
    }
    return true;
  }

  clear(): void {
    this.#store.clear();
    this.#hits = 0;
    this.#misses = 0;
    this.#evictions = 0;
    this.#expirations = 0;
    this.#eventHandlers.onClear?.();
  }

  keys(): string[] {
    return Array.from(this.#store.keys());
  }

  values<T>(): T[] {
    const arr: T[] = [];
    for (const entry of this.#store.values()) {
      arr.push(entry.value as T);
    }
    return arr;
  }

  entries<T>(): Array<{ key: string; value: T }> {
    const arr: Array<{ key: string; value: T }> = [];
    for (const [key, entry] of this.#store) {
      arr.push({ key, value: entry.value as T });
    }
    return arr;
  }

  #evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.#store) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.#store.get(oldestKey);
      this.#store.delete(oldestKey);
      this.#evictions++;
      try {
        this.#eventHandlers.onEvict?.(oldestKey, entry?.value, "lru");
      } catch {
        // handler error — cache state already consistent (key removed)
      }
    }
  }
}
