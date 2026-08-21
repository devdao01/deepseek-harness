/**
 * Browser-safe UUID generation for client-side wire correlation.
 *
 * `crypto.randomUUID()` is exposed only in SECURE CONTEXTS in browsers (HTTPS
 * or `localhost`), so it is `undefined` on a plain-HTTP LAN origin like
 * `http://192.168.0.5:3080` and calling it throws. `crypto.getRandomValues()`
 * carries no such restriction, so this helper builds an RFC 4122 version 4 UUID
 * over it and works on every origin (and in Node ≥19, whose global `crypto`
 * exposes the same Web Crypto surface). Client code that mints rpcIds or ids
 * MUST use this rather than `crypto.randomUUID`.
 * @module
 */

/**
 * Generate an RFC 4122 version 4 UUID without requiring a secure context.
 * @returns a UUID backed by `crypto.getRandomValues()`, which browsers expose on insecure origins.
 */
export function randomUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
