/**
 * Browser-safe UUID minting: a valid RFC 4122 v4 shape over
 * `crypto.getRandomValues`, so client-side rpcId/id minting works on insecure
 * origins where `crypto.randomUUID` is undefined.
 */

import { describe, expect, it } from 'vitest'
import { randomUuid } from '../src/fetch/random-uuid.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomUuid', () => {
  it('produces a canonical RFC 4122 version-4 UUID (version + variant bits set)', () => {
    const value = randomUuid()
    expect(value).toMatch(UUID_V4)
    // Version nibble is 4; variant nibble is one of 8/9/a/b.
    expect(value[14]).toBe('4')
    expect('89ab').toContain(value[19])
  })

  it('does not touch crypto.randomUUID — it works when only getRandomValues exists', () => {
    const original = globalThis.crypto
    // Simulate an insecure browser origin: getRandomValues present, randomUUID absent.
    const insecure = { getRandomValues: original.getRandomValues.bind(original) }
    Object.defineProperty(globalThis, 'crypto', { value: insecure, configurable: true })
    try {
      expect(randomUuid()).toMatch(UUID_V4)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })

  it('mints distinct ids (uniqueness smoke)', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomUuid()))
    expect(ids.size).toBe(1000)
  })
})
