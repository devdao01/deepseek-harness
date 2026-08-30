/**
 * Session access: signed user tickets identify the caller, the
 * `session_access` domain stores each restricted session's allowed users,
 * and `session/list` + `session/search` withhold restricted sessions from
 * callers the record does not name. Anonymous (no/invalid/expired ticket)
 * sees unrestricted sessions only.
 */

import { createHmac } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { runWithRpcRequest } from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { currentUserId, SessionAccessStore, verifyUserTicket } from '../src/access.ts'
import { ApiSessionList } from '../src/list.ts'
import { installSessionReadTestServices } from './test-remote.ts'
import SessionStore from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'

const SECRET = 'ticket-secret-for-tests-0123456789abcdef'

/** Mint a ticket exactly as the Odoo side does. */
function mint(userId: string, expiresAt: number, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify({ u: userId, exp: expiresAt })).toString('base64url')
  const mac = createHmac('sha256', secret).update(`v1.${body}`).digest().toString('base64url')
  return `v1.${body}.${mac}`
}

const future = (): number => Math.floor(Date.now() / 1000) + 600

/** In-memory stand-in for the storage-domain kv facet. */
function fakeStorageDomain(): { records: Map<string, unknown> } {
  const records = new Map<string, unknown>()
  return {
    records,
    open: () => Promise.resolve({
      table: () => ({
        get: (key: string) => records.get(key),
        put: (key: string, value: unknown) => {
          records.set(key, value)
          return Promise.resolve()
        },
        delete: (key: string) => Promise.resolve(records.delete(key)),
      }),
      close: () => {},
    }),
  } as never
}

function header(id: string, createdAt = 1000, cwd: string | undefined = '/w'): SessionHeader {
  return { version: 0, id: SessionId(id), createdAt, ...cwd === undefined ? {} : { cwd } }
}

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

describe('currentUserId', () => {
  it('reads the mtil-ticket cookie of the ambient RPC request', () => {
    const headers = new Headers({ cookie: `other=1; mtil-ticket=${mint('15', future())}` })
    const inside = runWithRpcRequest({ headers }, () => currentUserId(SECRET))
    expect(inside).toBe('15')
  })

  it('is anonymous outside a request, without a secret, and without the cookie', () => {
    expect(currentUserId(SECRET)).toBeUndefined()
    const headers = new Headers({ cookie: `mtil-ticket=${mint('15', future())}` })
    expect(runWithRpcRequest({ headers }, () => currentUserId(undefined))).toBeUndefined()
    expect(runWithRpcRequest({ headers: new Headers() }, () => currentUserId(SECRET))).toBeUndefined()
  })
})

describe('SessionAccessStore', () => {
  it('is inert without a storage domain: unrestricted reads, refused writes', async () => {
    const ctx = new Context()
    const store = new SessionAccessStore(ctx)

    expect(await store.writable()).toBe(false)
    expect(await store.allowedUsers(header('session-a'))).toEqual([])
    expect(await store.visibleTo(header('session-a'), undefined)).toBe(true)
    await expect(store.setAllowedUsers(header('session-a'), ['15'])).rejects.toThrow('no storage domain')
  })

  it('stores, dedupes, deletes-on-empty, and binds records to the log identity', async () => {
    const ctx = new Context()
    ctx.provide('storageDomain', fakeStorageDomain())
    const store = new SessionAccessStore(ctx)
    const sessionHeader = header('session-a')

    await store.setAllowedUsers(sessionHeader, ['15', '1', '15'])
    expect(await store.allowedUsers(sessionHeader)).toEqual(['1', '15'])
    expect(await store.visibleTo(sessionHeader, '15')).toBe(true)
    expect(await store.visibleTo(sessionHeader, '2')).toBe(false)
    expect(await store.visibleTo(sessionHeader, undefined)).toBe(false)

    // A recreated id (different createdAt) must not inherit the record.
    expect(await store.allowedUsers(header('session-a', 2000))).toEqual([])

    await store.setAllowedUsers(sessionHeader, [])
    expect(await store.allowedUsers(sessionHeader)).toEqual([])
    expect(await store.visibleTo(sessionHeader, undefined)).toBe(true)
  })
})

describe('session list filtering', () => {
  async function listHarness(): Promise<{ ctx: Context; store: SessionAccessStore; list: ApiSessionList }> {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    installSessionReadTestServices(ctx)
    ctx.provide('storageDomain', fakeStorageDomain())
    const store = new SessionAccessStore(ctx)
    const list = new ApiSessionList(ctx, 0, store)
    return { ctx, store, list }
  }

  it('withholds restricted sessions from anonymous and unlisted callers', async () => {
    const { ctx, store, list } = await listHarness()
    const open = header('session-open', 1000)
    const restricted = header('session-user15', 1000)
    await store.setAllowedUsers(restricted, ['15'])
    vi.spyOn(ctx.sessionQuery, 'listSessions').mockResolvedValue([
      { header: open, live: false, persisted: true },
      { header: restricted, live: false, persisted: true },
    ] as never)

    const anonymous = await list.list(undefined, undefined)
    expect(anonymous.map(item => item.sessionId)).toEqual([SessionId('session-open')])

    const stranger = await list.list(undefined, '2')
    expect(stranger.map(item => item.sessionId)).toEqual([SessionId('session-open')])

    const owner = await list.list(undefined, '15')
    expect(owner.map(item => item.sessionId).sort()).toEqual([
      SessionId('session-open'), SessionId('session-user15'),
    ])
    expect(owner.find(item => item.sessionId === SessionId('session-user15'))?.allowedUsers)
      .toEqual(['15'])
    expect(owner.find(item => item.sessionId === SessionId('session-open'))?.allowedUsers)
      .toBeUndefined()
  })
})
