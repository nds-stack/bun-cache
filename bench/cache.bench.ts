/* eslint-disable no-console */
import { BunCache } from "../src/index.ts";

const iterations = 10_000;
const samples = 3;

function bench(fn: () => void): number {
  // Warmup
  fn();

  const start = performance.now();
  for (let s = 0; s < samples; s++) {
    fn();
  }
  const elapsed = performance.now() - start;
  const totalOps = iterations * samples;
  return Math.round(totalOps / (elapsed / 1000));
}

function format(ops: number): string {
  if (ops > 1_000_000) return `${(ops / 1_000_000).toFixed(1)}M ops/s`;
  if (ops > 1_000) return `${(ops / 1_000).toFixed(0)}K ops/s`;
  return `${ops} ops/s`;
}

const results: Array<{ name: string; ops: number }> = [];

// --- Point get ---
const cacheGet = new BunCache({ maxKeys: iterations });
for (let i = 0; i < iterations; i++) cacheGet.set(`key-${i}`, i);

const mapGet = new Map<string, number>();
for (let i = 0; i < iterations; i++) mapGet.set(`key-${i}`, i);

results.push({
  name: "BunCache point get",
  ops: bench(() => { for (let i = 0; i < iterations; i++) cacheGet.get(`key-${i}`); }),
});

results.push({
  name: "Map point get",
  ops: bench(() => { for (let i = 0; i < iterations; i++) mapGet.get(`key-${i}`); }),
});

// --- Set no TTL ---
results.push({
  name: "BunCache set (no TTL)",
  ops: bench(() => {
    const c = new BunCache({ maxKeys: iterations });
    for (let i = 0; i < iterations; i++) c.set(`key-${i}`, i);
  }),
});

results.push({
  name: "Map set",
  ops: bench(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < iterations; i++) m.set(`key-${i}`, i);
  }),
});

// --- Set with TTL ---
results.push({
  name: "BunCache set with TTL",
  ops: bench(() => {
    const c = new BunCache({ maxKeys: iterations });
    for (let i = 0; i < iterations; i++) c.set(`key-${i}`, i, 60_000);
  }),
});

// --- Has ---
const cacheHas = new BunCache({ maxKeys: iterations });
for (let i = 0; i < iterations; i++) cacheHas.set(`key-${i}`, i);

results.push({
  name: "BunCache has",
  ops: bench(() => { for (let i = 0; i < iterations; i++) cacheHas.has(`key-${i}`); }),
});

// --- Print results ---
const nativeGet = results.find((r) => r.name === "Map point get")!.ops;

console.log("\n--- bun-cache Benchmark ---");
console.log(`Bun ${Bun.version}, ${iterations} iterations × ${samples} samples`);
console.log("");

const base = 2;
const pad = (s: string, n: number) => s.padEnd(n);

const opPad = results.reduce((m, r) => Math.max(m, r.name.length), 0);
console.log(`${pad("Operation", opPad + base)} | ${pad("Throughput", 14)} | ${pad("Overhead", 10)}`);
console.log(`${"-".repeat(opPad + base)}-|-${"-".repeat(14)}-|-${"-".repeat(10)}`);

for (const r of results) {
  const opsStr = format(r.ops);
  if (r.name.startsWith("Map point get")) {
    console.log(`${pad(r.name, opPad + base)} | ${pad(opsStr, 14)} | ${pad("(baseline)", 10)}`);
  } else if (r.name.startsWith("Map")) {
    console.log(`${pad(r.name, opPad + base)} | ${pad(opsStr, 14)} | ${pad("—", 10)}`);
  } else {
    const overhead = ((r.ops - nativeGet) / nativeGet * 100).toFixed(1);
    const sign = overhead.startsWith("-") ? "" : "+";
    console.log(`${pad(r.name, opPad + base)} | ${pad(opsStr, 14)} | ${pad(`${sign}${overhead}%`, 10)}`);
  }
}

console.log("");
