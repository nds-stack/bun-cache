/**
 * @module bun-cache-error
 * @description Base error class for bun-cache errors.
 */
export class BunCacheError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BunCacheError";
  }
}
