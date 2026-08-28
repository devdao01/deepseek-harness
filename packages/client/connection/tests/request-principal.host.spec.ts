/**
 * The request-principal seam: Connection runs each admitted `/api` handler inside
 * the AsyncLocalStorage of the principal its optional resolver derives, so a
 * downstream service reads `ctx.requestPrincipal.current()`. No resolver mounted
 * leaves every request principal-less.
 */

import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer, WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  API_PATH,
  apply,
  inject,
  type ConnectionTrustRequest,
  type HostConnectionHandle,
  type RequestPrincipalResolver,
} from '../src/index.ts'
import { provideBrowserCredentials } from './browser-credentials.ts'

function fakeHttpServer(routes: WebRoute[], upgrades: WebUpgradeRoute[]): Pick<WebServer, 'register' | 'registerUpgrade' | 'tapIndex' | 'port'> {
  return {
    register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } },
    registerUpgrade(route) { upgrades.push(route); return () => { upgrades.splice(upgrades.indexOf(route), 1) } },
    tapIndex: () => () => {},
    port: 0,
  }
}

function fakeRequest(headers: Record<string, string>, url: string): IncomingMessage {
  const request = Readable.from([]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'GET', headers })
  return request
}

function fakePost(headers: Record<string, string>, url: string, body: unknown): IncomingMessage {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'POST', headers: { 'content-type': 'application/json', ...headers } })
  return request
}

function fakeResponse(): { response: ServerResponse; state: { status?: number; headers?: Record<string, string>; body?: unknown } } {
  const state: { status?: number; headers?: Record<string, string>; body?: unknown } = {}
  const chunks: Buffer[] = []
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(value: number, headers?: Record<string, string>) {
      state.status = value
      if (headers !== undefined) state.headers = headers
      return this
    },
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

async function mount(resolver?: RequestPrincipalResolver): Promise<{
  ctx: Context
  routes: WebRoute[]
  connection: HostConnectionHandle
}> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  provideBrowserCredentials(ctx)
  ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
  if (resolver !== undefined) ctx.provide('requestPrincipalResolver', resolver)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, routes, connection: ctx.get('connection') as HostConnectionHandle }
}

function browserCookie(connection: HostConnectionHandle, authority: string): string {
  const url = new URL(connection.authenticatedUrl(`http://${authority}`))
  const exchanged = fakeResponse()
  connection.authorizeIndex(fakeRequest({ host: authority }, `${url.pathname}${url.search}`), exchanged.response)
  const setCookie = exchanged.state.headers?.['set-cookie']
  if (setCookie === undefined) throw new Error('token exchange set no cookie')
  return setCookie.split(';', 1)[0]!
}

/** Read a header from an admitted request (record or Headers). */
function header(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

const AUTHORITY = '127.0.0.1:3080'

/** POST to the `/api` route with the given headers; return the gate status and result envelope. */
async function postApi(
  seam: Awaited<ReturnType<typeof mount>>,
  headers: Record<string, string>,
): Promise<{ status: number | undefined; result: unknown }> {
  seam.connection.rpc.intercept('/api', () => true, () =>
    Promise.resolve({ ok: true as const, value: { seen: seam.ctx.requestPrincipal.current() ?? null } }))
  const route = seam.routes.find(candidate => candidate.path === API_PATH)
  if (route?.kind !== 'prefix') throw new Error('no /api prefix route')
  const { response, state } = fakeResponse()
  const body = { type: 'client-request', rpcId: 'r1', method: 'demo.echo', payload: { args: [] } }
  await route.handler(fakePost({ host: AUTHORITY, ...headers }, `${API_PATH}/demo.echo`, body), response)
  let result: unknown
  try {
    result = state.body === undefined ? undefined : (JSON.parse(String(state.body)) as { result: unknown }).result
  } catch {
    result = undefined
  }
  return { status: state.status, result }
}

/** POST as a browser authenticated by the process cookie, returning just the result envelope. */
async function callApi(
  seam: Awaited<ReturnType<typeof mount>>,
  extraHeaders: Record<string, string>,
): Promise<unknown> {
  const cookie = browserCookie(seam.connection, AUTHORITY)
  return (await postApi(seam, { cookie, ...extraHeaders })).result
}

describe('request-principal seam', () => {
  it('propagates the resolved principal to the /api handler', async () => {
    const seam = await mount({
      resolve: (request) => {
        const user = header(request.headers, 'x-mtil-user')
        return user === undefined ? undefined : { userId: user }
      },
    })
    expect(await callApi(seam, { 'x-mtil-user': 'alice' }))
      .toEqual({ ok: true, value: { seen: { userId: 'alice' } } })
  })

  it('leaves the principal undefined when the resolver returns none', async () => {
    const seam = await mount({ resolve: () => undefined })
    expect(await callApi(seam, {})).toEqual({ ok: true, value: { seen: null } })
  })

  it('leaves the principal undefined when no resolver is mounted', async () => {
    const seam = await mount()
    expect(await callApi(seam, { 'x-mtil-user': 'alice' })).toEqual({ ok: true, value: { seen: null } })
  })

  it('admits a valid-ticket request that carries no browser-session cookie', async () => {
    const seam = await mount({
      resolve: (request) => {
        const user = header(request.headers, 'x-mtil-user')
        return user === undefined ? undefined : { userId: user }
      },
    })
    expect(await postApi(seam, { 'x-mtil-user': 'alice' }))
      .toEqual({ status: 200, result: { ok: true, value: { seen: { userId: 'alice' } } } })
  })

  it('refuses a principal-less request that carries no browser-session cookie', async () => {
    const seam = await mount()
    expect((await postApi(seam, {})).status).toBe(401)
  })
})
