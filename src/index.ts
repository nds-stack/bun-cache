/**
 * @module index
 * @description Main entry point — re-exports public API.
 */
export { BunCache } from "./cache.ts";
export type { BunCacheOptions, CacheStats, EventHandlers } from "./types/index.ts";
export { BunCacheError } from "./errors/index.ts";
