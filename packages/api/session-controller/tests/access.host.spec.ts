/**
 * Session access: the `session_access` domain stores each restricted session's allowed users,
 * and `session/list` + `session/search` withhold restricted sessions from
 * callers the record does not name. Anonymous (no/invalid/expired ticket)
 * sees unrestricted sessions only.
 */

import { createHmac } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { runWithRpcRequest } from '@deepseek-ai/dsh-user-ticket'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { addressedSession, SessionAccessGate, SessionAccessStore } from '../src/access.ts'
import { SessionCommandController } from '../src/commands.ts'
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
  return { version: 4, id: SessionId(id), createdAt, isSeeded: false, ...cwd === undefined ? {} : { cwd } }
}

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

describe('session-addressed entry points', () => {
  it('refuses page and setAccess for callers the record does not name', async () => {
    const { createSessionTestController, testSessionPersistence } = await import('./test-remote.ts')
    const SessionStore = (await import('@deepseek-ai/dsh-session')).default
    const AgentRegistry = (await import('@deepseek-ai/dsh-agent')).default
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    ctx.provide('storageDomain', fakeStorageDomain())
    const restricted = header('session-restricted', 1000)
    ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
      list: () => Promise.resolve([restricted]),
      inspect: () => Promise.resolve({ meta: restricted, events: [] }),
    }) as never)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture' }),
      cwd: await mkdtemp(joinPath(tmpdir(), 'dsh-access-gate-')),
      ticketSecret: SECRET,
    })
    const store = new SessionAccessStore(ctx)
    await store.setAllowedUsers(restricted, ['632'])
    const pageRequest = {
      address: { kind: 'session' as const, sessionId: restricted.id },
      throughSeq: -1,
      maxMessages: 1,
    }
    const signal = new AbortController().signal

    // Anonymous and an unlisted user read the same not-found the id would
    // get if it did not exist; the wildcard passes the gate (and then reads).
    await expect(controller.page(pageRequest, signal))
      .rejects.toMatchObject({ code: 'session/not-found' })
    const headers7 = new Headers({ cookie: `mtil-ticket=${mint('7', future())}` })
    await expect(runWithRpcRequest({ headers: headers7 }, () => controller.page(pageRequest, signal)))
      .rejects.toMatchObject({ code: 'session/not-found' })
    const headersStar = new Headers({ cookie: `mtil-ticket=${mint('*', future())}` })
    await expect(runWithRpcRequest({ headers: headersStar }, () => controller.page(pageRequest, signal)))
      .resolves.toBeDefined()
    const headers632 = new Headers({ cookie: `mtil-ticket=${mint('632', future())}` })
    await expect(runWithRpcRequest({ headers: headers632 }, () => controller.page(pageRequest, signal)))
      .resolves.toBeDefined()

    // A hidden Session's projections read like an unknown Session's, and a
    // subagent address is gated through its parent.
    await expect(controller.projections({ sessionId: restricted.id }, signal)).resolves.toBeNull()
    await expect(controller.page({ ...pageRequest, address: { kind: 'subagent', parentSessionId: restricted.id, agentId: 'child' } } as never, signal))
      .rejects.toMatchObject({ code: 'session/not-found' })

    // follow captures the caller at CALL time: the WS carrier binds the
    // upgrade headers around the open, while iteration happens later in its
    // serve loop, outside any ambient scope — exactly what this simulates.
    const followRequest = { address: pageRequest.address, sinceSeq: -1 }
    const anonymousFollow = controller.follow(followRequest, signal)
    await expect((async () => {
      for await (const frame of anonymousFollow) void frame
    })()).rejects.toMatchObject({ code: 'session/not-found' })
    const allowedFollow = runWithRpcRequest(
      { headers: headers632 },
      () => controller.follow(followRequest as never, signal),
    )
    const firstFrame = await (async () => {
      for await (const frame of allowedFollow) return frame
      return undefined
    })()
    expect(firstFrame).toBeDefined()

    // The wildcard creates on behalf of others: a session it creates gets NO
    // creator tag (none pushed = deliberately public), unlike an ordinary
    // user. Creation itself is stubbed — the tag decision under test lives in
    // the Remote wrapper, after the command returns.
    let nextCreated = 0
    const fakeCreate = vi.spyOn(SessionCommandController.prototype, 'create').mockImplementation(() => {
      const sessionId = SessionId(`session-created-${nextCreated += 1}`)
      ctx.sessions.create(sessionId, { meta: { cwd: '/w' } })
      return Promise.resolve({ sessionId })
    })
    const created = await runWithRpcRequest(
      { headers: headersStar },
      () => controller.create({}),
    )
    const createdHeader = ctx.sessions.get(created.sessionId)?.header
    expect(createdHeader).toBeDefined()
    expect(await store.allowedUsers(createdHeader as never)).toEqual([])
    const owned = await runWithRpcRequest(
      { headers: headers632 },
      () => controller.create({}),
    )
    const ownedHeader = ctx.sessions.get(owned.sessionId)?.header
    expect(await store.allowedUsers(ownedHeader as never)).toEqual(['632'])

    // setAccess is management-plane only once a ticketSecret is configured.
    await expect(controller.setAccess({ sessionId: restricted.id, allowedUsers: [] }))
      .rejects.toMatchObject({ code: 'gateway/internal' })
    await expect(runWithRpcRequest(
      { headers: headersStar },
      () => controller.setAccess({ sessionId: restricted.id, allowedUsers: ['1'] }),
    )).resolves.toEqual({ allowedUsers: ['1'] })
    await expect(runWithRpcRequest(
      { headers: headersStar },
      () => controller.setAccess({ sessionId: SessionId('session-missing'), allowedUsers: [] }),
    )).rejects.toMatchObject({ code: 'session/not-found' })
    expect(fakeCreate).toHaveBeenCalledTimes(2)
    fakeCreate.mockRestore()
    await ctx.fiber.dispose()
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
    const list = new ApiSessionList(ctx, store)
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

    // '*' is the management wildcard: everything, with records attached.
    const admin = await list.list(undefined, '*')
    expect(admin.map(item => item.sessionId).sort()).toEqual([
      SessionId('session-open'), SessionId('session-user15'),
    ])
    expect(admin.find(item => item.sessionId === SessionId('session-user15'))?.allowedUsers)
      .toEqual(['15'])
    expect(owner.find(item => item.sessionId === SessionId('session-user15'))?.allowedUsers)
      .toEqual(['15'])
    expect(owner.find(item => item.sessionId === SessionId('session-open'))?.allowedUsers)
      .toBeUndefined()
  })
})

describe('SessionAccessGate', () => {
  it('keeps an existing record, ignores unknown Sessions, and reports refused writes', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    installSessionReadTestServices(ctx)
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const inert = new SessionAccessGate(ctx, new SessionAccessStore(ctx), SECRET)
    const live = ctx.sessions.create(SessionId('live'), { meta: { cwd: '/w' } })
    const headers7 = new Headers({ cookie: `mtil-ticket=${mint('7', future())}` })
    await runWithRpcRequest({ headers: headers7 }, () => inert.claimCreated(SessionId('unknown')))
    expect(warn).not.toHaveBeenCalled()
    await runWithRpcRequest({ headers: headers7 }, () => inert.claimCreated(live.id))
    expect(warn).toHaveBeenCalledOnce()
    const open = new SessionAccessGate(ctx, new SessionAccessStore(ctx), undefined)
    expect(open.ticketed).toBe(false)
    await expect(open.setAccess({ sessionId: live.id, allowedUsers: ['1'] })).rejects.toMatchObject({ code: 'gateway/internal' })

    ctx.provide('storageDomain', fakeStorageDomain())
    const store = new SessionAccessStore(ctx)
    const gate = new SessionAccessGate(ctx, store, SECRET)
    await store.setAllowedUsers(live.header, ['15'])
    await runWithRpcRequest({ headers: headers7 }, () => gate.claimCreated(live.id))
    expect(await store.allowedUsers(live.header)).toEqual(['15'])
    await ctx.fiber.dispose()
  })

  it('binds records without a cwd and resolves subagent addresses to their parent', async () => {
    const ctx = new Context()
    ctx.provide('storageDomain', fakeStorageDomain())
    const store = new SessionAccessStore(ctx)
    const noCwd: SessionHeader = { version: 4, id: SessionId('no-cwd'), createdAt: 1, isSeeded: false }
    await store.setAllowedUsers(noCwd, ['1'])
    expect(await store.allowedUsers(noCwd)).toEqual(['1'])
    expect(addressedSession({ kind: 'subagent', parentSessionId: SessionId('parent') } as never)).toBe('parent')
  })
})

describe('session search filtering', () => {
  it('returns nothing when every searchable Session is hidden from the caller', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    installSessionReadTestServices(ctx)
    ctx.provide('storageDomain', fakeStorageDomain())
    const store = new SessionAccessStore(ctx)
    const restricted = header('session-hidden', 1000)
    await store.setAllowedUsers(restricted, ['15'])
    vi.spyOn(ctx.sessionQuery, 'listSessions').mockResolvedValue([{ header: restricted, live: false, persisted: true }] as never)
    const search = vi.spyOn(ctx.sessionQuery, 'searchSessions')
    await expect(new ApiSessionList(ctx, store).search('q', new AbortController().signal, undefined))
      .resolves.toEqual({ items: [], hasMore: false })
    expect(search).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })
})

describe('preset workspace wiring', () => {
  it('reconciles preset workspaces before the first listing', async () => {
    const { createSessionTestController } = await import('./test-remote.ts')
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture' }),
      cwd: await mkdtemp(joinPath(tmpdir(), 'dsh-access-preset-')),
      presetWorkspaceRoot: await mkdtemp(joinPath(tmpdir(), 'dsh-access-root-')),
    })
    await expect(controller.list({}, new AbortController().signal)).resolves.toEqual({ items: [] })
    await ctx.fiber.dispose()
  })
})
