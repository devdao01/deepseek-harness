/**
 * Per-user access enforcement over a real Storage → storage-domain →
 * session-access → createApiProxy composition, driven through the fetch
 * carrier with distinct principals (full token + two ticket users):
 *   - management setAccess/getAccess are full-token only;
 *   - a ticket caller's session-scoped unary is 403 unless it holds access;
 *   - session.list rows are filtered per ticket user;
 *   - the mux stream subscribes only the sessions a ticket user may read;
 *   - a full token sees and reaches everything, unchanged.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SessionAccessService from '@deepseek-ai/dsh-session-access'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
import type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import type { ApiProxy, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { sessionScopeOf, toFetchHandler } from '../src/fetch/handler.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const ALICE: ApiPrincipal = { kind: 'ticket', userId: UserId('alice') }
const BOB: ApiPrincipal = { kind: 'ticket', userId: UserId('bob') }
const TOKEN: ApiPrincipal = { kind: 'token' }
const ANON: ApiPrincipal = { kind: 'anonymous' }

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(SessionAccessService)
  const proxy = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  // Two attached sessions so list/stream filtering has something to hide.
  const a = ctx.sessions.create()
  const b = ctx.sessions.create()
  for (const session of [a, b]) {
    ctx.agents.register({
      id: session.id,
      session,
      inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
      status: 'idle',
      ctx,
    } as Agent)
  }
  return { ctx, proxy, a: a.id, b: b.id }
}

/** POST one unary method through the fetch carrier as `principal`; return the parsed ServerResponse result. */
async function call(
  proxy: ReturnType<typeof createApiProxy>,
  principal: ApiPrincipal,
  method: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: { code: string }; value?: unknown }> {
  const response = await toFetchHandler(proxy, principal).fetch(new Request(`http://h/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload }),
  }))
  const body = await response.json() as { result: { ok: boolean; error?: { code: string }; value?: unknown } }
  return body.result
}

/** Collect the mux frames available within a brief window, then abort the stream. */
async function drainBriefly(iterable: AsyncIterable<RpcRequest<MuxFrame>>, abort: AbortController): Promise<MuxFrame[]> {
  const frames: MuxFrame[] = []
  const timer = setTimeout(() => { abort.abort() }, 40)
  try {
    for await (const envelope of iterable) frames.push(envelope.payload)
  } finally {
    clearTimeout(timer)
  }
  return frames
}

describe('sessionScopeOf (shared unary + remote-gateway extraction)', () => {
  it('reads the flat unary sessionId', () => {
    expect(sessionScopeOf({ sessionId: 's-1' })).toBe('s-1')
  })

  it('reads a subagent parentSessionId', () => {
    expect(sessionScopeOf({ parentSessionId: 'p-1' })).toBe('p-1')
  })

  it('reads a remote-gateway args.request.sessionId', () => {
    expect(sessionScopeOf({ args: { request: { sessionId: 'r-1' } } })).toBe('r-1')
  })

  it('reads a remote-gateway args.agentId as the session id', () => {
    expect(sessionScopeOf({ args: { agentId: 'a-1' } })).toBe('a-1')
  })

  it('is undefined for a payload with no session scope', () => {
    expect(sessionScopeOf({ args: { other: 1 } })).toBeUndefined()
    expect(sessionScopeOf({})).toBeUndefined()
    expect(sessionScopeOf(null)).toBeUndefined()
  })
})

describe('per-session access management (full-token only)', () => {
  it('lets a full token set and read a session access set', async () => {
    const { proxy, a } = await harness()
    expect(await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] }))
      .toEqual({ ok: true, value: { userIds: ['alice'] } })
    expect(await call(proxy, TOKEN, 'session.getAccess', { sessionId: a }))
      .toEqual({ ok: true, value: { userIds: ['alice'] } })
  })

  it('rejects setAccess from a ticket caller with forbidden', async () => {
    const { proxy, a } = await harness()
    const result = await call(proxy, ALICE, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })

  it('rejects getAccess from a ticket caller with forbidden', async () => {
    const { proxy, a } = await harness()
    const result = await call(proxy, BOB, 'session.getAccess', { sessionId: a })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })
})

describe('session-scoped unary enforcement', () => {
  it('forbids a ticket caller with no access to the session', async () => {
    const { proxy, a } = await harness()
    const result = await call(proxy, ALICE, 'session.history', { sessionId: a })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })

  it('admits a ticket caller granted access to the session', async () => {
    const { proxy, a } = await harness()
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    const result = await call(proxy, ALICE, 'session.history', { sessionId: a })
    // Reaches the impl (real session → ok history), never the forbidden gate.
    expect(result.error?.code).not.toBe('forbidden')
    expect(result.ok).toBe(true)
  })

  it('lets a full token reach any session unchanged', async () => {
    const { proxy, a } = await harness()
    const result = await call(proxy, TOKEN, 'session.history', { sessionId: a })
    expect(result.ok).toBe(true)
  })

  it('forbids a revoked ticket caller after the set is emptied', async () => {
    const { proxy, a } = await harness()
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: [] })
    const result = await call(proxy, ALICE, 'session.history', { sessionId: a })
    expect(result.error?.code).toBe('forbidden')
  })
})

describe('session.list row filtering', () => {
  it('shows a ticket user only the sessions it may read', async () => {
    const { proxy, a, b } = await harness()
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    const aliceList = await call(proxy, ALICE, 'session.list', {}) as { ok: true; value: { items: { sessionId: SessionId }[] } }
    expect(aliceList.value.items.map(item => item.sessionId)).toEqual([a])
    const bobList = await call(proxy, BOB, 'session.list', {}) as { ok: true; value: { items: { sessionId: SessionId }[] } }
    expect(bobList.value.items).toEqual([])
    const tokenList = await call(proxy, TOKEN, 'session.list', {}) as { ok: true; value: { items: { sessionId: SessionId }[] } }
    expect(new Set(tokenList.value.items.map(item => item.sessionId))).toEqual(new Set([a, b]))
  })
})

describe('session download gate', () => {
  it('forbids a session-log download for a ticket caller without access', async () => {
    const { proxy, a } = await harness()
    const response = await toFetchHandler(proxy, ALICE).fetch(
      new Request(`http://h/api/session.export?sessionId=${a}`, { method: 'GET' }),
    )
    expect(response.status).toBe(403)
  })

  it('passes the gate for a granted ticket caller (reaching the download impl)', async () => {
    const { proxy, a } = await harness()
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    const response = await toFetchHandler(proxy, ALICE).fetch(
      new Request(`http://h/api/session.export?sessionId=${a}`, { method: 'GET' }),
    )
    // Past the 403 gate; the impl answers 500 here only because this harness
    // mounts no export dependencies. The point is it is not the access refusal.
    expect(response.status).not.toBe(403)
  })
})

describe('composition without the access seam', () => {
  it('answers setAccess with an internal "unavailable" error when no store is composed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    const proxy = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
    const session = ctx.sessions.create()
    const result = await call(proxy, TOKEN, 'session.setAccess', { sessionId: session.id, userIds: ['alice'] })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('internal')
  })

  it('answers the management route "unavailable" when the proxy omits the access facet', async () => {
    // A proxy with no `access` facet: setAccess is full-token-gated (passes for
    // TOKEN) then hits the route's unavailable branch.
    const proxy = {} as unknown as ApiProxy
    const result = await call(proxy, TOKEN, 'session.setAccess', { sessionId: 's', userIds: [] })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('internal')
  })
})

describe('anonymous caller (credential-less, ticket-configured) fails closed', () => {
  it('denies a session-scoped unary call', async () => {
    const { proxy, a } = await harness()
    await call(proxy, TOKEN, 'session.setAccess', { sessionId: a, userIds: ['alice'] })
    const result = await call(proxy, ANON, 'session.history', { sessionId: a })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })

  it('denies even a non-session read method (enumerates nothing)', async () => {
    const { proxy } = await harness()
    const result = await call(proxy, ANON, 'session.list', {})
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })

  it('denies the management methods', async () => {
    const { proxy, a } = await harness()
    const result = await call(proxy, ANON, 'session.getAccess', { sessionId: a })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('forbidden')
  })

  it('delivers zero mux frames', async () => {
    const { ctx, proxy, a } = await harness()
    // Even a session with a populated access set is invisible to anonymous.
    await ctx.sessionAccess.set(a, [UserId('alice')])
    const abort = new AbortController()
    const frames = await drainBriefly(proxy.events.mux({ rpcId: 'm' as never, payload: {} }, abort.signal, ANON), abort)
    expect(frames).toEqual([])
  })

  it('forbids a session-log download', async () => {
    const { proxy, a } = await harness()
    const response = await toFetchHandler(proxy, ANON).fetch(
      new Request(`http://h/api/session.export?sessionId=${a}`, { method: 'GET' }),
    )
    expect(response.status).toBe(403)
  })
})

describe('mux stream subscription filtering', () => {
  it('subscribes a ticket user only to sessions it may read', async () => {
    const { ctx, proxy, a } = await harness()
    await ctx.sessionAccess.set(a, [UserId('alice')])
    const abort = new AbortController()
    const frames = await drainBriefly(proxy.events.mux({ rpcId: 'm' as never, payload: {} }, abort.signal, ALICE), abort)
    const subscribed = frames.filter((f): f is Extract<MuxFrame, { type: 'session/subscribed' }> => f.type === 'session/subscribed')
    expect(subscribed.map(f => f.sessionId)).toEqual([a])
  })

  it('subscribes a full token to every session', async () => {
    const { proxy, a, b } = await harness()
    const abort = new AbortController()
    const frames = await drainBriefly(proxy.events.mux({ rpcId: 'm' as never, payload: {} }, abort.signal, TOKEN), abort)
    const subscribed = frames
      .filter((f): f is Extract<MuxFrame, { type: 'session/subscribed' }> => f.type === 'session/subscribed')
      .map(f => f.sessionId)
    expect(new Set(subscribed)).toEqual(new Set([a, b]))
  })
})
