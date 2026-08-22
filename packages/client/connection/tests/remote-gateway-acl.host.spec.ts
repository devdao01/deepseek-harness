/**
 * Remote-gateway ACL enforcement: the Typert-gateway endpoints the SPA uses
 * (`messageFeedback/*` via `args.request.sessionId`, `commands/list` via
 * `args.agentId`) route through the interceptor, OFF the ApiProxy dispatch. The
 * carrier gates them by principal before the gateway sees the call — full token
 * bypasses, a ticket needs access to the call's session, and an anonymous or
 * session-less ticket call is refused with the `forbidden` envelope.
 */

import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { WebServer, WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { signTicket, UserId, type ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import { API_PATH, apply, inject, type HostConnectionHandle } from '../src/index.ts'

const FULL_TOKEN = 'f'.repeat(32)
const TICKET_SECRET = 't'.repeat(32)
const GRANTED = 'granted-session'
const OTHER = 'other-session'
const futureExp = (): number => Math.floor(Date.now() / 1000) + 300

function fakeHttpServer(routes: WebRoute[], upgrades: WebUpgradeRoute[]): Pick<WebServer, 'register' | 'registerUpgrade' | 'tapIndex' | 'port'> {
  return {
    register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } },
    registerUpgrade(route) { upgrades.push(route); return () => { upgrades.splice(upgrades.indexOf(route), 1) } },
    tapIndex: () => () => {},
    port: 0,
  }
}

function fakePost(headers: Record<string, string>, url: string, body: unknown): IncomingMessage {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'POST', headers: { 'content-type': 'application/json', ...headers } })
  return request
}

function fakeResponse(): { response: ServerResponse; state: { status?: number; body?: unknown } } {
  const state: { status?: number; body?: unknown } = {}
  const chunks: Buffer[] = []
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(value: number) { state.status = value; return this },
    write(value: string | Uint8Array) { chunks.push(Buffer.from(value)); return true },
    end(this: { writableEnded: boolean }, value?: unknown) {
      if (typeof value === 'string' || value instanceof Uint8Array) chunks.push(Buffer.from(value))
      if (chunks.length > 0) state.body = Buffer.concat(chunks).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return { response, state }
}

/** A fake access seam admitting the full token and only the GRANTED session for tickets. */
const fakeAccess = {
  canRead: (principal: ApiPrincipal, sessionId: string): boolean =>
    principal.kind === 'token' || (principal.kind === 'ticket' && sessionId === GRANTED),
}

async function harness() {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
  ctx.provide('apiProxy', { events: { mux: async function* () {}, host: async function* () {} } } as unknown as ApiProxy)
  ctx.provide('sessionAccess', fakeAccess as never)
  const fiber = ctx.plugin({ inject: [...inject], apply }, {
    trustedHosts: ['harness.example'],
    auth: { tokens: [{ name: 'full', token: FULL_TOKEN }], unpinned: [], ticket: { secret: TICKET_SECRET } },
  })
  await fiber.await()
  const connection = ctx.get('connection') as HostConnectionHandle
  const calls: string[] = []
  connection.rpc.intercept(
    '/api',
    endpoint => endpoint === 'messageFeedback/list' || endpoint === 'messageFeedback/put' || endpoint === 'commands/list',
    async (endpoint) => { calls.push(endpoint); return { ok: true, value: { accepted: true } } },
    { authority: 'trusted-host' },
  )
  const route = routes.find(candidate => candidate.path === API_PATH)
  if (route === undefined) throw new Error('no /api route registered')
  const post = async (headers: Record<string, string>, endpoint: string, args: unknown) => {
    const recorder = fakeResponse()
    await route.handler(
      fakePost({ host: 'harness.example', ...headers }, `${API_PATH}/${endpoint}`, {
        type: 'client-request', rpcId: 'r', method: endpoint, payload: { args },
      }),
      recorder.response,
    )
    return recorder.state
  }
  return { calls, post }
}

const ticketHeader = (userId: string): Record<string, string> =>
  ({ authorization: `Bearer ${signTicket({ userId: UserId(userId), exp: futureExp() }, TICKET_SECRET)}` })
const tokenHeader: Record<string, string> = { authorization: `Bearer ${FULL_TOKEN}` }

function body(state: { body?: unknown }): { result: { ok: boolean; error?: { code: string } } } {
  return JSON.parse(String(state.body)) as { result: { ok: boolean; error?: { code: string } } }
}

describe('remote-gateway ACL', () => {
  it('bypasses the gate for a full token', async () => {
    const { calls, post } = await harness()
    const state = await post(tokenHeader, 'messageFeedback/list', { request: { sessionId: OTHER } })
    expect(body(state).result.ok).toBe(true)
    expect(calls).toEqual(['messageFeedback/list'])
  })

  it('admits a ticket caller for a session it may read (args.request.sessionId)', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'messageFeedback/list', { request: { sessionId: GRANTED } })
    expect(body(state).result.ok).toBe(true)
    expect(calls).toEqual(['messageFeedback/list'])
  })

  it('forbids a ticket caller READING another session feedback', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'messageFeedback/list', { request: { sessionId: OTHER } })
    expect(body(state).result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(calls).toEqual([])
  })

  it('forbids a ticket caller WRITING another session feedback', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'messageFeedback/put', { request: { sessionId: OTHER, vote: 'up' } })
    expect(body(state).result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(calls).toEqual([])
  })

  it('forbids commands/list for a non-member agentId (= sessionId)', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'commands/list', { agentId: OTHER })
    expect(body(state).result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(calls).toEqual([])
  })

  it('admits commands/list for a member agentId', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'commands/list', { agentId: GRANTED })
    expect(body(state).result.ok).toBe(true)
    expect(calls).toEqual(['commands/list'])
  })

  it('forbids a ticket remote call with no extractable session id', async () => {
    const { calls, post } = await harness()
    const state = await post(ticketHeader('alice'), 'messageFeedback/list', {})
    expect(body(state).result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(calls).toEqual([])
  })

  it('forbids an anonymous (credential-less, ticket-configured) caller even for a granted session', async () => {
    const { calls, post } = await harness()
    const state = await post({}, 'messageFeedback/list', { request: { sessionId: GRANTED } })
    expect(body(state).result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(calls).toEqual([])
  })
})
