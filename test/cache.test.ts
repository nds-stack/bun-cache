import { describe, test, expect } from "bun:test";
import { BunCache } from "../src/index.ts";

describe("BunCache", () => {
  test("set and get a value", () => {
    const cache = new BunCache();
    cache.set("key1", "value1");
    expect(cache.get<string>("key1")).toBe("value1");
  });

  test("get returns undefined for missing key", () => {
    const cache = new BunCache();
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  test("has returns correct boolean", () => {
    const cache = new BunCache();
    cache.set("key1", 42);
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("nonexistent")).toBe(false);
  });

  test("delete removes a key", () => {
    const cache = new BunCache();
    cache.set("key1", "value1");
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
  });

  test("delete returns false for missing key", () => {
    const cache = new BunCache();
    expect(cache.delete("nonexistent")).toBe(false);
  });

  test("size reflects number of entries", () => {
    const cache = new BunCache();
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
    cache.delete("a");
    expect(cache.size).toBe(1);
  });

  test("clear removes all entries", () => {
    const cache = new BunCache();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  test("set with TTL expires after timeout", async () => {
    const cache = new BunCache();
    cache.set("key", "value", 10);
    expect(cache.get<string>("key")).toBe("value");

    await Bun.sleep(15);
    expect(cache.get("key")).toBeUndefined();
  });

  test("has returns false for expired key", async () => {
    const cache = new BunCache();
    cache.set("key", "value", 10);
    await Bun.sleep(15);
    expect(cache.has("key")).toBe(false);
  });

  test("set without TTL never expires", async () => {
    const cache = new BunCache();
    cache.set("key", "persistent");
    await Bun.sleep(50);
    expect(cache.get<string>("key")).toBe("persistent");
  });

  test("set respects defaultTTL option", async () => {
    const cache = new BunCache({ defaultTTL: 10 });
    cache.set("key", "value");
    await Bun.sleep(15);
    expect(cache.get("key")).toBeUndefined();
  });

  test("set with explicit TTL overrides defaultTTL", async () => {
    const cache = new BunCache({ defaultTTL: 10 });
    cache.set("key", "value", 100);
    await Bun.sleep(15);
    expect(cache.get<string>("key")).toBe("value");
  });

  test("evicts LRU when maxKeys is exceeded", () => {
    const cache = new BunCache({ maxKeys: 3 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.get("a");

    cache.set("d", 4);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
    expect(cache.size).toBe(3);
  });

  test("stats tracks hits and misses", () => {
    const cache = new BunCache();
    cache.set("key", "value");

    cache.get("key");
    cache.get("key");
    cache.get("missing");

    const s = cache.stats;
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(2 / 3);
    expect(s.size).toBe(1);
  });

  test("stats hitRate is 0 when no operations", () => {
    const cache = new BunCache();
    expect(cache.stats.hitRate).toBe(0);
  });

  test("stats tracks evictions", () => {
    const cache = new BunCache({ maxKeys: 2 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.stats.evictions).toBe(1);
  });

  test("onExpire is called when key expires", async () => {
    const expired: Array<{ key: string; value: unknown }> = [];
    const cache = new BunCache();

    cache.onExpire = (key, value) => {
      expired.push({ key, value });
    };

    cache.set("key", "value", 5);
    await Bun.sleep(10);
    cache.get("key");

    expect(expired.length).toBe(1);
    expect(expired[0]?.key).toBe("key");
    expect(expired[0]?.value).toBe("value");
  });

  test("onEvict is called on LRU eviction", () => {
    const evicted: Array<{ key: string }> = [];
    const cache = new BunCache({ maxKeys: 2 });

    cache.onEvict = (key, _value, _reason) => {
      evicted.push({ key });
    };

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(evicted.length).toBe(1);
    expect(evicted[0]?.key).toBe("a");
  });

  test("onEvict is called on manual delete", () => {
    const evicted: Array<{ key: string; reason: string }> = [];
    const cache = new BunCache();

    cache.onEvict = (key, _value, _reason) => {
      evicted.push({ key, reason: _reason });
    };

    cache.set("key", "value");
    cache.delete("key");

    expect(evicted.length).toBe(1);
    expect(evicted[0]?.reason).toBe("manual");
  });

  test("onClear is called on clear", () => {
    let cleared = false;
    const cache = new BunCache();
    cache.onClear = () => { cleared = true; };

    cache.set("a", 1);
    cache.clear();

    expect(cleared).toBe(true);
  });

  test("set overwrites existing key", () => {
    const cache = new BunCache();
    cache.set("key", "old");
    cache.set("key", "new");
    expect(cache.get<string>("key")).toBe("new");
    expect(cache.size).toBe(1);
  });

  test("keys returns all keys", () => {
    const cache = new BunCache();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    const keys = cache.keys();
    expect(keys.sort()).toEqual(["a", "b", "c"]);
  });

  test("values returns all values", () => {
    const cache = new BunCache();
    cache.set("a", 1);
    cache.set("b", 2);

    const values = cache.values<number>();
    expect(values.sort()).toEqual([1, 2]);
  });

  test("entries returns key-value pairs", () => {
    const cache = new BunCache();
    cache.set("a", 1);
    cache.set("b", 2);

    const entries = cache.entries<number>();
    expect(entries.length).toBe(2);
  });

  test("expired key increments stats miss", async () => {
    const cache = new BunCache();
    cache.set("key", "value", 5);
    await Bun.sleep(10);
    cache.get("key");

    expect(cache.stats.expirations).toBe(1);
  });

  test("handles many keys efficiently", () => {
    const cache = new BunCache({ maxKeys: 500 });

    for (let i = 0; i < 1000; i++) {
      cache.set(`key-${i}`, i);
    }

    expect(cache.size).toBe(500);
    expect(cache.stats.evictions).toBe(500);
    expect(cache.has("key-999")).toBe(true);
    expect(cache.has("key-0")).toBe(false);
  });

  test("remainingTTL returns positive for unexpired key", async () => {
    const cache = new BunCache();
    cache.set("key", "value", 100);
    const ttl = cache.remainingTTL("key");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(100);
  });

  test("remainingTTL returns -1 for missing key", () => {
    const cache = new BunCache();
    expect(cache.remainingTTL("nonexistent")).toBe(-1);
  });

  test("remainingTTL returns -1 for key without TTL", () => {
    const cache = new BunCache();
    cache.set("key", "value");
    expect(cache.remainingTTL("key")).toBe(-1);
  });

  test("remainingTTL returns -1 for expired key", async () => {
    const cache = new BunCache();
    cache.set("key", "value", 5);
    await Bun.sleep(10);
    expect(cache.remainingTTL("key")).toBe(-1);
  });

  test("unlimited maxKeys does not evict", () => {
    const cache = new BunCache({ maxKeys: 0 });
    for (let i = 0; i < 5000; i++) {
      cache.set(`key-${i}`, i);
    }
    expect(cache.size).toBe(5000);
    expect(cache.stats.evictions).toBe(0);
  });
});
