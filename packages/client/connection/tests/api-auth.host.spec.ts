/**
 * Bearer-token authentication logic: config validation (fail loud), the
 * constant-time token check (match / unknown / absent), and the browser-marker
 * detector that keeps a token from bypassing the CSRF fence.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  authenticateApiRequest,
  DEFAULT_UNPINNED_METHODS,
  deriveWebRuntimeAuth,
  MIN_API_TOKEN_LENGTH,
  prepareApiAuth,
  requestHasBrowserMarker,
  type ApiAuthConfig,
} from '../src/api-auth.ts'

const PINNED: ReadonlySet<string> = new Set(['agentPreset.read', 'agentPreset.copy', 'settings.update'])
const GOOD_TOKEN = 'a'.repeat(MIN_API_TOKEN_LENGTH)

function config(overrides: Partial<ApiAuthConfig> = {}): ApiAuthConfig {
  return { tokens: [{ name: 'odoo', token: GOOD_TOKEN }], unpinned: [], ...overrides }
}

describe('prepareApiAuth', () => {
  it('returns undefined when no auth is configured', () => {
    expect(prepareApiAuth(undefined, PINNED)).toBeUndefined()
  })

  it('returns undefined when the token list is empty (auth disabled)', () => {
    expect(prepareApiAuth({ tokens: [], unpinned: [] }, PINNED)).toBeUndefined()
  })

  it('validates an empty-token unpinned list so a typo still fails loud', () => {
    expect(() => prepareApiAuth({ tokens: [], unpinned: ['nope.method'] }, PINNED))
      .toThrow(/auth.unpinned entry "nope.method" is not a pinned method/)
  })

  it('prepares tokens and the unpinned set when configured', () => {
    const prepared = prepareApiAuth(config({ unpinned: ['agentPreset.read'] }), PINNED)
    expect(prepared).toBeDefined()
    expect(prepared?.unpinned.has('agentPreset.read')).toBe(true)
    expect(prepared?.digests).toHaveLength(1)
  })

  it('rejects an unpinned entry outside the fixed pinned set', () => {
    expect(() => prepareApiAuth(config({ unpinned: ['session.list'] }), PINNED))
      .toThrow(/auth.unpinned entry "session.list" is not a pinned method/)
  })

  it('rejects a token shorter than the minimum length', () => {
    expect(() => prepareApiAuth(config({ tokens: [{ name: 'short', token: 'a'.repeat(MIN_API_TOKEN_LENGTH - 1) }] }), PINNED))
      .toThrow(/auth token "short" must be at least 16 characters/)
  })
})

describe('authenticateApiRequest', () => {
  const prepared = prepareApiAuth(config(), PINNED)

  it('reports absent when no Authorization header is present', () => {
    expect(authenticateApiRequest({}, prepared)).toBe('absent')
  })

  it('reports absent when authentication is disabled, ignoring any token', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}` }, undefined)).toBe('absent')
  })

  it('authenticates a matching bearer token', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}` }, prepared)).toBe('authenticated')
  })

  it('accepts the bearer scheme case-insensitively with extra whitespace', () => {
    expect(authenticateApiRequest({ authorization: `  bEaRer   ${GOOD_TOKEN}` }, prepared)).toBe('authenticated')
  })

  it('reports invalid for a present-but-unknown token', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${'b'.repeat(MIN_API_TOKEN_LENGTH)}` }, prepared)).toBe('invalid')
  })

  it('reports absent for a non-bearer Authorization scheme', () => {
    expect(authenticateApiRequest({ authorization: 'Basic dXNlcjpwYXNz' }, prepared)).toBe('absent')
  })

  it('reports absent for a bearer header with no token', () => {
    expect(authenticateApiRequest({ authorization: 'Bearer ' }, prepared)).toBe('absent')
  })

  it('matches any configured token without an early return (constant-time structure)', () => {
    const second = 'c'.repeat(MIN_API_TOKEN_LENGTH)
    const multi = prepareApiAuth(config({ tokens: [
      { name: 'a', token: GOOD_TOKEN },
      { name: 'b', token: second },
    ] }), PINNED)
    // The second token authenticates: matchesConfiguredToken ORs across every
    // digest rather than returning on the first, so position never decides.
    expect(authenticateApiRequest({ authorization: `Bearer ${second}` }, multi)).toBe('authenticated')
    // And the digests are SHA-256 (fixed 32-byte compare inputs), never raw tokens.
    expect(multi?.digests[0]).toEqual(createHash('sha256').update(GOOD_TOKEN).digest())
  })

  it('reads a Fetch Headers representation as well as a Node header bag', () => {
    const headers = new Headers({ authorization: `Bearer ${GOOD_TOKEN}` })
    expect(authenticateApiRequest(headers, prepared)).toBe('authenticated')
  })
})

describe('deriveWebRuntimeAuth', () => {
  it('leaves auth disabled when no web-runtime token exists', () => {
    expect(deriveWebRuntimeAuth(undefined)).toBeUndefined()
  })

  it('derives a single web token granting the default unpinned pins', () => {
    expect(deriveWebRuntimeAuth(GOOD_TOKEN)).toEqual({
      tokens: [{ name: 'web', token: GOOD_TOKEN }],
      unpinned: [...DEFAULT_UNPINNED_METHODS],
    })
  })

  it('defaults the unpinned set to the agentPreset authoring plane only', () => {
    expect([...DEFAULT_UNPINNED_METHODS]).toEqual([
      'agentPreset.read', 'agentPreset.copy', 'agentPreset.openDocument', 'agentPreset.remove',
    ])
    // Every derived pin is itself pinned, so prepareApiAuth accepts the default.
    const pinned: ReadonlySet<string> = new Set([...DEFAULT_UNPINNED_METHODS, 'settings.update'])
    expect(() => prepareApiAuth(deriveWebRuntimeAuth(GOOD_TOKEN), pinned)).not.toThrow()
  })
})

describe('requestHasBrowserMarker', () => {
  it('is true when an Origin header is present', () => {
    expect(requestHasBrowserMarker({ origin: 'http://localhost:3080' })).toBe(true)
  })

  it('is true when a sec-fetch-site marker is present without an Origin', () => {
    expect(requestHasBrowserMarker({ 'sec-fetch-site': 'same-origin' })).toBe(true)
  })

  it('is false for a marker-less (non-browser) request', () => {
    expect(requestHasBrowserMarker({ host: 'harness.example', authorization: `Bearer ${GOOD_TOKEN}` })).toBe(false)
  })
})
