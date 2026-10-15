import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { currentTicketUserId, runWithRpcRequest, verifyUserTicket } from '../src/index.ts'

const SECRET = 'ticket-secret-for-tests-0123456789abcdef'

/** Mint a ticket exactly as the Odoo side does. */
function mint(userId: string, expiresAt: number, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify({ u: userId, exp: expiresAt })).toString('base64url')
  const mac = createHmac('sha256', secret).update(`v1.${body}`).digest().toString('base64url')
  return `v1.${body}.${mac}`
}

const future = (): number => Math.floor(Date.now() / 1000) + 600

describe('verifyUserTicket', () => {
  it('accepts a freshly minted ticket and returns its user id', () => {
    expect(verifyUserTicket(mint('15', future()), SECRET)).toBe('15')
  })

  it('rejects a wrong signature, another secret, and tampered bodies', () => {
    const ticket = mint('15', future())
    expect(verifyUserTicket(ticket, 'another-secret')).toBeUndefined()
    const [v, body] = ticket.split('.')
    const forged = Buffer.from(JSON.stringify({ u: '1', exp: future() })).toString('base64url')
    expect(verifyUserTicket(`${v}.${forged}.${ticket.split('.')[2]}`, SECRET)).toBeUndefined()
    expect(verifyUserTicket(`${v}.${body}.AAAA`, SECRET)).toBeUndefined()
  })

  it('rejects expired, malformed, and wrong-version tickets', () => {
    expect(verifyUserTicket(mint('15', Math.floor(Date.now() / 1000) - 1), SECRET)).toBeUndefined()
    expect(verifyUserTicket('nonsense', SECRET)).toBeUndefined()
    expect(verifyUserTicket('v2.a.b', SECRET)).toBeUndefined()
    const body = Buffer.from('not json').toString('base64url')
    const mac = createHmac('sha256', SECRET).update(`v1.${body}`).digest().toString('base64url')
    expect(verifyUserTicket(`v1.${body}.${mac}`, SECRET)).toBeUndefined()
  })
})

describe('currentTicketUserId', () => {
  it('reads the mtil-ticket cookie of the ambient RPC request', () => {
    const headers = new Headers({ cookie: `other=1; mtil-ticket=${mint('15', future())}` })
    const inside = runWithRpcRequest({ headers }, () => currentTicketUserId(SECRET))
    expect(inside).toBe('15')
  })

  it('is anonymous outside a request, without a secret, and without the cookie', () => {
    expect(currentTicketUserId(SECRET)).toBeUndefined()
    const headers = new Headers({ cookie: `mtil-ticket=${mint('15', future())}` })
    expect(runWithRpcRequest({ headers }, () => currentTicketUserId(undefined))).toBeUndefined()
    expect(runWithRpcRequest({ headers: new Headers() }, () => currentTicketUserId(SECRET))).toBeUndefined()
  })
})

describe('verifyUserTicket payload checks', () => {
  const signed = (payload: string): string => {
    const body = Buffer.from(payload).toString('base64url')
    const mac = createHmac('sha256', SECRET).update(`v1.${body}`).digest().toString('base64url')
    return `v1.${body}.${mac}`
  }

  it.each([
    ['a non-base64url signature', 'v1.e30.***'],
    ['a non-base64url body', (() => {
      const mac = createHmac('sha256', SECRET).update('v1.***').digest().toString('base64url')
      return `v1.***.${mac}`
    })()],
    ['a non-object payload', signed('7')],
    ['an empty user', signed(JSON.stringify({ u: '', exp: future() }))],
    ['a missing expiry', signed(JSON.stringify({ u: '1' }))],
    ['an unparsable payload', signed('{')],
  ])('rejects %s', (_label, ticket) => {
    expect(verifyUserTicket(ticket, SECRET)).toBeUndefined()
  })

  it('reads a Cookie header without the ticket as anonymous', () => {
    expect(runWithRpcRequest({ headers: new Headers({ cookie: 'other=1' }) }, () => currentTicketUserId(SECRET))).toBeUndefined()
  })

  it('skips cookie segments without a value separator', () => {
    const headers = new Headers({ cookie: `flag; mtil-ticket=${mint('9', future())}` })
    expect(runWithRpcRequest({ headers }, () => currentTicketUserId(SECRET))).toBe('9')
  })
})
