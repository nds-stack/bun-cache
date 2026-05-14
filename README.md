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

## Eviction & Expiration

BunCache has two independent mechanisms for removing entries.

### 1. TTL Expiration (Lazy)
- Checked during `get()` and `has()` — not at `set()` time
- If `entry.expiresAt` has passed, the entry is removed from the store
- Fires `onExpire(key, value)` — does NOT count as an eviction (`stats.evictions` is not incremented)
- No timers or intervals involved — **zero background overhead**
- Expired entries remain in memory until the next `get()` or `has()` access

### 2. LRU Eviction (When Full)
- Triggered during `set()` when `this.#store.size >= maxKeys` and the key does not already exist
- Scans all entries to find the one with the oldest `lastUsed` timestamp
- Removes that entry, then inserts the new one
- Fires `onEvict(key, value, "lru")` — increments `stats.evictions`
- Manual `delete()` fires `onEvict(key, value, "manual")` — also increments `stats.evictions`

### Interaction Between TTL and LRU
- TTL and LRU are **independent mechanisms** that operate on separate code paths
- A TTL-expired key is removed by `get()`/`has()` **before** LRU eviction ever considers it
- LRU eviction does **not** check TTL — it only looks at `lastUsed`
- When both are active and the cache is full:
  1. Expired keys are cleaned lazily when accessed
  2. If no expired keys are accessed, `set()` triggers LRU eviction for the least recently used entry
- TTL expiration never increments `stats.evictions` — use `stats.expirations` to track TTL removals

### Example: Both TTL and LRU Active

```typescript
import { BunCache } from "@nds-stack/bun-cache";

const cache = new BunCache({ maxKeys: 3, defaultTTL: 5000 });

cache.onExpire = (key, value) => console.log(`expired: ${key}=${value}`);
cache.onEvict = (key, value, reason) => console.log(`evicted: ${key}=${value} (${reason})`);

cache.set("a", 1);   // TTL: 5s
cache.set("b", 2);   // TTL: 5s
cache.set("c", 3);   // TTL: 5s

cache.set("d", 4);   // maxKeys=3 exceeded → onEvict("a", 1, "lru")

// After 5 seconds...
cache.get("b");      // → undefined, onExpire("b", 2) fires
cache.has("c");      // → false, onExpire("c", 3) fires

// Stats after all operations:
console.log(cache.stats);
// { size: 1, hits: 0, misses: 2, evictions: 1, expirations: 2 }
```

> Note: `onEvict` fires for both LRU eviction (`reason: "lru"`) and manual delete (`reason: "manual"`). TTL expiration uses a separate callback — `onExpire`. If you need to track ALL removals, subscribe to both events.

---

## Multi-Instance Strategy

BunCache is in-memory and process-specific, but you can still use it effectively in multi-instance deployments by layering it on top of a shared store. Below are three practical approaches.

### Approach 1: Local Cache + Shared Database (Read-Through)

Use BunCache as a local read cache in front of a shared database. Each instance caches hot data locally to reduce database load.

```typescript
import { BunCache } from "@nds-stack/bun-cache";
// import { db } from "./db";  // bun:sqlite, Postgres, etc.

const local = new BunCache({ maxKeys: 1000, defaultTTL: 60_000 });

async function getUser(id: string): Promise<User | null> {
  // 1. Check local cache (fast, ~4.5M ops/s)
  const cached = local.get<User>(`user:${id}`);
  if (cached) return cached;

  // 2. Miss — read from shared database
  const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);

  // 3. Populate local cache for next read
  if (user) local.set(`user:${id}`, user, 60_000);

  return user;
}

async function updateUser(id: string, data: Partial<User>): Promise<void> {
  // 1. Write to shared database (source of truth)
  await db.run("UPDATE users SET ... WHERE id = ?", [id, ...data]);

  // 2. Invalidate local cache entry
  local.delete(`user:${id}`);
}
```

**Pros:** Simple, zero external infrastructure beyond your database.  
**Cons:** Stale reads until TTL expires (unless you explicitly invalidate on write).

### Approach 2: Local Cache + Redis (Cache-Aside with Invalidation)

Use Redis as the shared cache layer, with BunCache as a local hot-cache to reduce Redis round-trips. Invalidation signals flow via Redis pub/sub.

```typescript
import { BunCache } from "@nds-stack/bun-cache";
// import { redis } from "./redis";  // ioredis or bun-redis

const local = new BunCache({ maxKeys: 5000, defaultTTL: 120_000 });

async function getCached(key: string): Promise<string | null> {
  // 1. Check local cache first
  const hit = local.get<string>(key);
  if (hit !== undefined) return hit;

  // 2. Miss — check Redis
  const value = await redis.get(key);
  if (value !== null) {
    local.set(key, value, 120_000); // populate local
  }
  return value;
}

async function setCached(key: string, value: string): Promise<void> {
  // 1. Write to Redis (shared)
  await redis.set(key, value, "EX", 3600);

  // 2. Update local cache
  local.set(key, value, 120_000);

  // 3. Publish invalidation to other instances
  await redis.publish("cache:invalidate", key);
}

// Subscribe to invalidation from other instances
// redis.subscribe("cache:invalidate", (key) => local.delete(key));
```

**Pros:** Fast local reads, shared state via Redis, active invalidation across instances.  
**Cons:** Requires Redis.

### Approach 3: Local Cache + SQLite (via bunql)

Use bunql (SQLite) as a shared persistence layer for process-local caching with cross-instance durability.

```typescript
import { BunCache } from "@nds-stack/bun-cache";
// import { db } from "@nds-stack/bunql";

const local = new BunCache({ maxKeys: 1000, defaultTTL: 30_000 });

async function getSettings(key: string): Promise<Settings | null> {
  const cached = local.get<Settings>(`settings:${key}`);
  if (cached) return cached;

  const row = db.query<Settings>(
    "SELECT value FROM settings WHERE key = ?", [key]
  );
  if (row.rows.length > 0) {
    local.set(`settings:${key}`, row.rows[0], 30_000);
    return row.rows[0];
  }
  return null;
}
```

### Which Approach to Choose

| Scenario | Recommended | Why |
|----------|-------------|-----|
| You already have **Postgres/MySQL** | Approach 1 | No extra infra, cache-aside pattern |
| You need **fast cross-instance invalidation** | Approach 2 | Redis pub/sub notifies all instances |
| You want **Bun-native, zero infra** | Approach 3 | SQLite via bunql, multi-process reads |
| **Single instance** | Just BunCache | No shared layer needed |

> **Bottom line:** BunCache handles the local hot-cache layer. For cross-instance consistency, pair it with a shared store — BunCache makes your shared store faster by absorbing repeated reads.

---

## Limitations

- **In-memory only** — BunCache stores data in the current process memory. Data is lost when the process exits.
- **No persistence** — BunCache is a pure in-memory cache. There is no file or database backing.
- **Single-process design** — BunCache is designed for single-process Bun applications. For multi-instance consistency, use one of the strategies above.
- **No distributed coordination** — BunCache does not implement distributed locking, leader election, or consensus protocols.
- **LRU is O(n)** — Eviction scanning is O(cache size). For very large caches (>100K entries), consider an alternative eviction strategy.

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
