/**
 * Ticket format round-trip and verification: signature authenticity, the
 * expired-vs-invalid distinction, clock-skew tolerance, and the max-TTL guard.
 */

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TICKET_CLOCK_SKEW_SECONDS,
  DEFAULT_TICKET_MAX_TTL_SECONDS,
  MIN_TICKET_SECRET_LENGTH,
  prepareTicketAuth,
  signTicket,
  UserId,
  verifyTicket,
  type PreparedTicketAuth,
} from '../src/index.ts'

const SECRET = 's'.repeat(MIN_TICKET_SECRET_LENGTH)
const NOW = 1_000_000

function prepared(overrides: Partial<{ secret: string; maxTtlSeconds: number; clockSkewSeconds: number }> = {}): PreparedTicketAuth {
  const result = prepareTicketAuth({ secret: SECRET, ...overrides })
  if (result === undefined) throw new Error('expected prepared ticket auth')
  return result
}

describe('prepareTicketAuth', () => {
  it('returns undefined when no ticket block is configured', () => {
    expect(prepareTicketAuth(undefined)).toBeUndefined()
  })

  it('treats an empty secret as ticket auth disabled', () => {
    expect(prepareTicketAuth({ secret: '' })).toBeUndefined()
  })

  it('fails loud when a present secret is shorter than the minimum', () => {
    expect(() => prepareTicketAuth({ secret: 's'.repeat(MIN_TICKET_SECRET_LENGTH - 1) }))
      .toThrow(/auth.ticket.secret must be at least 32 characters/)
  })

  it('applies the default TTL and skew when unset', () => {
    const result = prepared()
    expect(result.maxTtlSeconds).toBe(DEFAULT_TICKET_MAX_TTL_SECONDS)
    expect(result.clockSkewSeconds).toBe(DEFAULT_TICKET_CLOCK_SKEW_SECONDS)
  })

  it('rejects a non-positive max TTL', () => {
    expect(() => prepareTicketAuth({ secret: SECRET, maxTtlSeconds: 0 }))
      .toThrow(/maxTtlSeconds must be a positive number/)
  })

  it('rejects a negative clock skew', () => {
    expect(() => prepareTicketAuth({ secret: SECRET, clockSkewSeconds: -1 }))
      .toThrow(/clockSkewSeconds must be a non-negative number/)
  })
})

describe('verifyTicket', () => {
  it('verifies a freshly signed ticket and recovers the user id', () => {
    const token = signTicket({ userId: UserId('alice'), exp: NOW + 600 }, SECRET)
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: true, userId: 'alice' })
  })

  it('signs from a raw string user id equivalently', () => {
    const token = signTicket({ userId: 'bob', exp: NOW + 600 }, SECRET)
    const result = verifyTicket(token, prepared(), NOW)
    expect(result).toEqual({ ok: true, userId: 'bob' })
  })

  it('reports expired for an authentic ticket past exp plus skew', () => {
    const token = signTicket({ userId: 'alice', exp: NOW - DEFAULT_TICKET_CLOCK_SKEW_SECONDS - 1 }, SECRET)
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a just-expired ticket still inside the clock-skew window', () => {
    const token = signTicket({ userId: 'alice', exp: NOW - DEFAULT_TICKET_CLOCK_SKEW_SECONDS }, SECRET)
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: true, userId: 'alice' })
  })

  it('reports invalid for a wrong-secret signature', () => {
    const token = signTicket({ userId: 'alice', exp: NOW + 600 }, 'x'.repeat(MIN_TICKET_SECRET_LENGTH))
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports invalid for a tampered payload the MAC no longer covers', () => {
    const token = signTicket({ userId: 'alice', exp: NOW + 600 }, SECRET)
    const [version, , mac] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'attacker', exp: NOW + 600 }), 'utf8').toString('base64url')
    expect(verifyTicket(`${version}.${forged}.${mac}`, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports invalid for a malformed (non three-part) token', () => {
    expect(verifyTicket('not-a-ticket', prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports invalid for an unknown version prefix', () => {
    const token = signTicket({ userId: 'alice', exp: NOW + 600 }, SECRET)
    const rest = token.slice(token.indexOf('.'))
    expect(verifyTicket(`v2${rest}`, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports invalid when the MAC covers a non-JSON body', () => {
    const body = Buffer.from('not json', 'utf8').toString('base64url')
    const signingInput = `v1.${body}`
    const mac = createHmac('sha256', SECRET).update(signingInput).digest().toString('base64url')
    expect(verifyTicket(`${signingInput}.${mac}`, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports invalid when a correctly signed payload lacks the required claims', () => {
    const body = Buffer.from(JSON.stringify({ exp: NOW + 600 }), 'utf8').toString('base64url')
    const signingInput = `v1.${body}`
    const mac = createHmac('sha256', SECRET).update(signingInput).digest().toString('base64url')
    expect(verifyTicket(`${signingInput}.${mac}`, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a far-future exp beyond the max-TTL guard as invalid, not expired', () => {
    const token = signTicket({ userId: 'alice', exp: NOW + DEFAULT_TICKET_MAX_TTL_SECONDS + 1 }, SECRET)
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts an exp exactly at the max-TTL boundary', () => {
    const token = signTicket({ userId: 'alice', exp: NOW + DEFAULT_TICKET_MAX_TTL_SECONDS }, SECRET)
    expect(verifyTicket(token, prepared(), NOW)).toEqual({ ok: true, userId: 'alice' })
  })

  it('defaults nowSeconds to the wall clock', () => {
    const token = signTicket({ userId: 'alice', exp: Math.floor(Date.now() / 1000) + 300 }, SECRET)
    expect(verifyTicket(token, prepared())).toEqual({ ok: true, userId: 'alice' })
  })
})
