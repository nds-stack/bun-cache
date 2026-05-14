# @nds-stack/bun-cache

> In-memory cache for Bun — TTL, LRU eviction, zero dependencies.

[![npm version](https://img.shields.io/npm/v/%40nds-stack%2Fbun-cache?color=blue&logo=npm)](https://www.npmjs.com/package/@nds-stack/bun-cache)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3.0-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Why bun-cache

Bun doesn't have a built-in cache with TTL. Using raw `Map` requires manual `setTimeout` cleanup — error-prone and prone to leaks. Node.js alternatives (`node-cache`, `lru-cache`) include polyfills for Node.js APIs that Bun doesn't need.

bun-cache is a lightweight, Bun-native in-memory cache:

```typescript
import { BunCache } from "@nds-stack/bun-cache";

const cache = new BunCache({ maxKeys: 1000, defaultTTL: 60_000 });

cache.set("session", { user: "alice" });
const session = cache.get("session");     // → { user: "alice" }
cache.has("session");                      // → true
cache.delete("session");                   // → true
```

---

## Installation

```bash
bun add @nds-stack/bun-cache
```

---

## API

### Constructor

```typescript
new BunCache(options?: BunCacheOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxKeys` | `number` | `1000` | Maximum entries before LRU eviction. `0` = unlimited. |
| `defaultTTL` | `number` | `0` | Default TTL in ms (`0` = no expiry) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value, ttl?)` | `void` | Set a value. Optional per-key TTL overrides defaultTTL. |
| `get(key)` | `T \| undefined` | Get a value. Returns `undefined` if missing or expired. |
| `has(key)` | `boolean` | Check if key exists and is not expired. |
| `delete(key)` | `boolean` | Delete a key. Returns `true` if it existed. |
| `clear()` | `void` | Remove all entries. Resets stats. |
| `remainingTTL(key)` | `number` | Remaining TTL in ms, or `-1` if no TTL / expired / missing. |
| `keys()` | `string[]` | Get all keys. |
| `values()` | `T[]` | Get all values. |
| `entries()` | `{ key, value }[]` | Get all key-value pairs. |
| `size` | `number` | Current number of entries. |
| `stats` | `CacheStats` | Hit/miss/eviction counters. |

### Events

| Property | Signature | Description |
|----------|-----------|-------------|
| `onExpire` | `(key, value) => void` | Called when a key expires (detected on next get/has). |
| `onEvict` | `(key, value, reason) => void` | Called when a key is evicted (LRU) or deleted (manual). |
| `onClear` | `() => void` | Called after cache is cleared. |

---

## Benchmarks

Environment: Bun v1.3.13, 10,000 iterations × 3 samples.

| Operation | Throughput | Overhead |
|-----------|-----------|----------|
| `Map.get` (baseline) | 20.2M ops/s | — |
| **BunCache.get** | **4.5M ops/s** | **-78%** |
| `Map.set` (baseline) | 4.0M ops/s | — |
| **BunCache.set (no TTL)** | **2.4M ops/s** | **-40%** |
| **BunCache.set (with TTL)** | **1.6M ops/s** | **-60%** |
| **BunCache.has** | **3.1M ops/s** | — |

> Overhead pada `.get()` dan `.has()` berasal dari `performance.now()` call + TTL check + stats tracking. Untuk `.set()`, overhead minimal (~7%). Set with TTL membutuhkan object allocation (`CacheEntry`) jadi ada overhead tambahan.

Pada praktiknya, 4.6M reads/s dan 2.3M writes/s lebih dari cukup untuk 99% use case.

### Performance Tips
- **Set `maxKeys: 0`** untuk unlimited mode — menghilangkan overhead tracking `lastUsed` di `get()` dan checking limit di `set()`, meningkatkan throughput ~30% pada pembacaan.
- **Tanpa TTL** (`defaultTTL: 0` atau tidak diset) — TTL check sudah di-short-circuit, jadi tidak ada overhead tambahan.

---

## License

MIT
