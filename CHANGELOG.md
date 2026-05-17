# Changelog

## [0.1.0-beta.0] - 2026-05-18

### Fixed
- Input validation: non-string keys now throw `TypeError`; NaN/Infinity/negative TTL treated as no expiry
- `has()` now increments `#misses` on expired keys (consistent with `get()`)
- `delete()` no longer increments `#evictions` (counter tracks only LRU evictions)
- `clear()` no longer fires `onEvict` per entry
- `#evictLRU` is now O(1) using Map insertion order
- `get()`, `has()`, `remainingTTL()` all use `#isExpired()` helper (consistent expiry logic)

### Changed
- README: corrected `-1` TTL example to `0` (code treats `<=0` as no expiry, not instant expiry)

## [0.1.0-alpha.1] - 2026-05-15

### Changed
- README: added Eviction & Expiration section with TTL vs LRU interaction details
- README: added Limitations section covering multi-instance and in-memory constraints
- README: documented `onEvict` reason parameter explicitly

## [0.1.0-alpha.0] - 2026-05-15

### Added
- Initial release
- BunCache class with set, get, has, delete, clear, keys, values, entries
- TTL support — per-key and defaultTTL option
- LRU eviction when maxKeys exceeded
- Cache stats (hits, misses, hitRate, evictions, expirations)
- Event handlers: onExpire, onEvict, onClear
- Zero dependencies
