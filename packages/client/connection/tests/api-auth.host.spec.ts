/**
 * Bearer-token authentication logic: config validation (fail loud), the
 * constant-time token check (match / unknown / absent), and the browser-marker
 * detector that keeps a token from bypassing the CSRF fence.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { signTicket } from '@deepseek-ai/dsh-user-ticket'
import {
  authenticateApiRequest,
  DEFAULT_UNPINNED_METHODS,
  deriveWebRuntimeAuth,
  MIN_API_TOKEN_LENGTH,
  prepareApiAuth,
  requestHasBrowserMarker,
  resolveHttpPrincipal,
  ticketChallenge,
  type ApiAuthConfig,
} from '../src/api-auth.ts'

const PINNED: ReadonlySet<string> = new Set(['agentPreset.read', 'agentPreset.copy', 'settings.update'])
const GOOD_TOKEN = 'a'.repeat(MIN_API_TOKEN_LENGTH)
const TICKET_SECRET = 't'.repeat(32)
const futureExp = (): number => Math.floor(Date.now() / 1000) + 300

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
    expect(prepared?.ticket).toBeUndefined()
  })

  it('prepares ticket-only auth with no full tokens', () => {
    const prepared = prepareApiAuth({ tokens: [], unpinned: [], ticket: { secret: TICKET_SECRET } }, PINNED)
    expect(prepared).toBeDefined()
    expect(prepared?.digests).toHaveLength(0)
    expect(prepared?.ticket).toBeDefined()
  })

  it('stays disabled when neither tokens nor a ticket secret are configured', () => {
    expect(prepareApiAuth({ tokens: [], unpinned: [], ticket: { secret: '' } }, PINNED)).toBeUndefined()
  })

  it('fails loud on a present-but-short ticket secret', () => {
    expect(() => prepareApiAuth({ tokens: [], unpinned: [], ticket: { secret: 'short' } }, PINNED))
      .toThrow(/auth.ticket.secret must be at least 32 characters/)
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
  const withTicket = prepareApiAuth(config({ ticket: { secret: TICKET_SECRET } }), PINNED)

  it('reports absent when no Authorization header is present', () => {
    expect(authenticateApiRequest({}, prepared)).toEqual({ status: 'absent' })
  })

  it('reports absent when authentication is disabled, ignoring any token', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}` }, undefined)).toEqual({ status: 'absent' })
  })

  it('resolves a matching bearer token to the full-token principal', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}` }, prepared))
      .toEqual({ status: 'ok', principal: { kind: 'token' } })
  })

  it('accepts the bearer scheme case-insensitively with extra whitespace', () => {
    expect(authenticateApiRequest({ authorization: `  bEaRer   ${GOOD_TOKEN}` }, prepared))
      .toEqual({ status: 'ok', principal: { kind: 'token' } })
  })

  it('reports invalid (unknown-token) for a present-but-unknown token with no ticket verifier', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${'b'.repeat(MIN_API_TOKEN_LENGTH)}` }, prepared))
      .toEqual({ status: 'invalid', reason: 'unknown-token' })
  })

  it('resolves a valid ticket to a per-user principal', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, TICKET_SECRET)
    expect(authenticateApiRequest({ authorization: `Bearer ${ticket}` }, withTicket))
      .toEqual({ status: 'ok', principal: { kind: 'ticket', userId: 'alice' } })
  })

  it('still resolves the full token first even when a ticket verifier is configured', () => {
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}` }, withTicket))
      .toEqual({ status: 'ok', principal: { kind: 'token' } })
  })

  it('reports ticket-expired for an authentic but stale ticket', () => {
    const ticket = signTicket({ userId: 'alice', exp: Math.floor(Date.now() / 1000) - 3600 }, TICKET_SECRET)
    expect(authenticateApiRequest({ authorization: `Bearer ${ticket}` }, withTicket))
      .toEqual({ status: 'invalid', reason: 'ticket-expired' })
  })

  it('reports ticket-invalid for a wrong-secret ticket', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, 'w'.repeat(32))
    expect(authenticateApiRequest({ authorization: `Bearer ${ticket}` }, withTicket))
      .toEqual({ status: 'invalid', reason: 'ticket-invalid' })
  })

  it('reports absent for a non-bearer Authorization scheme', () => {
    expect(authenticateApiRequest({ authorization: 'Basic dXNlcjpwYXNz' }, prepared)).toEqual({ status: 'absent' })
  })

  it('reports absent for a bearer header with no token', () => {
    expect(authenticateApiRequest({ authorization: 'Bearer ' }, prepared)).toEqual({ status: 'absent' })
  })

  it('matches any configured token without an early return (constant-time structure)', () => {
    const second = 'c'.repeat(MIN_API_TOKEN_LENGTH)
    const multi = prepareApiAuth(config({ tokens: [
      { name: 'a', token: GOOD_TOKEN },
      { name: 'b', token: second },
    ] }), PINNED)
    // The second token authenticates: matchesConfiguredToken ORs across every
    // digest rather than returning on the first, so position never decides.
    expect(authenticateApiRequest({ authorization: `Bearer ${second}` }, multi))
      .toEqual({ status: 'ok', principal: { kind: 'token' } })
    // And the digests are SHA-256 (fixed 32-byte compare inputs), never raw tokens.
    expect(multi?.digests[0]).toEqual(createHash('sha256').update(GOOD_TOKEN).digest())
  })

  it('reads a Fetch Headers representation as well as a Node header bag', () => {
    const headers = new Headers({ authorization: `Bearer ${GOOD_TOKEN}` })
    expect(authenticateApiRequest(headers, prepared)).toEqual({ status: 'ok', principal: { kind: 'token' } })
  })
})

describe('authenticateApiRequest — ticket cookie transport', () => {
  const withTicket = prepareApiAuth(config({ ticket: { secret: TICKET_SECRET } }), PINNED)
  const tokenOnly = prepareApiAuth(config(), PINNED)

  it('resolves a valid ticket cookie to a per-user principal', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, TICKET_SECRET)
    expect(authenticateApiRequest({ cookie: `dsh_ticket=${ticket}` }, withTicket))
      .toEqual({ status: 'ok', principal: { kind: 'ticket', userId: 'alice' } })
  })

  it('finds the ticket cookie among other cookies', () => {
    const ticket = signTicket({ userId: 'bob', exp: futureExp() }, TICKET_SECRET)
    expect(authenticateApiRequest({ cookie: `session_id=abc; dsh_ticket=${ticket}; theme=dark` }, withTicket))
      .toEqual({ status: 'ok', principal: { kind: 'ticket', userId: 'bob' } })
  })

  it('lets the Authorization header win over a cookie', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, TICKET_SECRET)
    expect(authenticateApiRequest({ authorization: `Bearer ${GOOD_TOKEN}`, cookie: `dsh_ticket=${ticket}` }, withTicket))
      .toEqual({ status: 'ok', principal: { kind: 'token' } })
  })

  it('never accepts the full API token from a cookie (cookie is ticket-only)', () => {
    // A full-token string placed in the cookie must fail ticket verification
    // rather than escalate to the unscoped token principal.
    expect(authenticateApiRequest({ cookie: `dsh_ticket=${GOOD_TOKEN}` }, withTicket))
      .toEqual({ status: 'invalid', reason: 'ticket-invalid' })
  })

  it('reports ticket-expired for a stale ticket cookie', () => {
    const ticket = signTicket({ userId: 'alice', exp: Math.floor(Date.now() / 1000) - 3600 }, TICKET_SECRET)
    expect(authenticateApiRequest({ cookie: `dsh_ticket=${ticket}` }, withTicket))
      .toEqual({ status: 'invalid', reason: 'ticket-expired' })
  })

  it('ignores a ticket cookie when ticket auth is not configured', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, TICKET_SECRET)
    expect(authenticateApiRequest({ cookie: `dsh_ticket=${ticket}` }, tokenOnly)).toEqual({ status: 'absent' })
  })

  it('reports absent for an empty ticket cookie value', () => {
    expect(authenticateApiRequest({ cookie: 'dsh_ticket=' }, withTicket)).toEqual({ status: 'absent' })
  })

  it('reports absent when no dsh_ticket cookie is present', () => {
    expect(authenticateApiRequest({ cookie: 'session_id=abc; theme=dark' }, withTicket)).toEqual({ status: 'absent' })
  })

  it('resolves a cookie ticket through resolveHttpPrincipal (WS handshake path)', () => {
    const ticket = signTicket({ userId: 'carol', exp: futureExp() }, TICKET_SECRET)
    expect(resolveHttpPrincipal({ cookie: `dsh_ticket=${ticket}` }, withTicket))
      .toEqual({ kind: 'ticket', userId: 'carol' })
  })
})

describe('resolveHttpPrincipal (absent-fail-closed)', () => {
  const tokenOnly = prepareApiAuth(config(), PINNED)
  const withTicket = prepareApiAuth(config({ ticket: { secret: TICKET_SECRET } }), PINNED)

  it('resolves a full token to the full-token principal', () => {
    expect(resolveHttpPrincipal({ authorization: `Bearer ${GOOD_TOKEN}` }, withTicket)).toEqual({ kind: 'token' })
  })

  it('resolves a valid ticket to its per-user principal', () => {
    const ticket = signTicket({ userId: 'alice', exp: futureExp() }, TICKET_SECRET)
    expect(resolveHttpPrincipal({ authorization: `Bearer ${ticket}` }, withTicket)).toEqual({ kind: 'ticket', userId: 'alice' })
  })

  it('fails closed to anonymous for a credential-less request when ticket auth is configured', () => {
    expect(resolveHttpPrincipal({}, withTicket)).toEqual({ kind: 'anonymous' })
  })

  it('stays full-token for a credential-less request when ticket auth is NOT configured (byte-for-byte)', () => {
    expect(resolveHttpPrincipal({}, tokenOnly)).toEqual({ kind: 'token' })
  })

  it('stays full-token for a credential-less request when authentication is entirely disabled', () => {
    expect(resolveHttpPrincipal({}, undefined)).toEqual({ kind: 'token' })
  })
})

describe('ticketChallenge', () => {
  it('tells the SPA to refresh on an expired ticket', () => {
    expect(ticketChallenge('ticket-expired')).toBe('Bearer error="invalid_token", error_description="ticket expired"')
  })

  it('marks a bogus ticket as invalid', () => {
    expect(ticketChallenge('ticket-invalid')).toBe('Bearer error="invalid_token", error_description="invalid ticket"')
  })

  it('stays header-less for an unknown full token', () => {
    expect(ticketChallenge('unknown-token')).toBeUndefined()
  })

  it('stays header-less when there is no reason', () => {
    expect(ticketChallenge(undefined)).toBeUndefined()
  })
})

describe('deriveWebRuntimeAuth', () => {
  it('leaves auth disabled when neither a token nor a ticket secret exists', () => {
    expect(deriveWebRuntimeAuth(undefined)).toBeUndefined()
    expect(deriveWebRuntimeAuth(undefined, undefined)).toBeUndefined()
  })

  it('derives a single web token granting the default unpinned pins', () => {
    expect(deriveWebRuntimeAuth(GOOD_TOKEN)).toEqual({
      tokens: [{ name: 'web', token: GOOD_TOKEN }],
      unpinned: [...DEFAULT_UNPINNED_METHODS],
    })
  })

  it('adds ticket auth when a ticket secret is present', () => {
    expect(deriveWebRuntimeAuth(GOOD_TOKEN, TICKET_SECRET)).toEqual({
      tokens: [{ name: 'web', token: GOOD_TOKEN }],
      unpinned: [...DEFAULT_UNPINNED_METHODS],
      ticket: { secret: TICKET_SECRET },
    })
  })

  it('derives ticket-only auth when a secret is present without a token', () => {
    expect(deriveWebRuntimeAuth(undefined, TICKET_SECRET)).toEqual({
      tokens: [],
      unpinned: [...DEFAULT_UNPINNED_METHODS],
      ticket: { secret: TICKET_SECRET },
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
