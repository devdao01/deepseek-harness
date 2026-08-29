/**
 * The operator-auth seam: Connection admits a principal-less, non-browser caller
 * that carries the operator secret in the `x-dsh-operator` header, leaving it
 * principal-less so the operator-gated controllers keep treating it as the
 * operator. The secret never bypasses the Host/Origin fence (403 still applies
 * first), and no `operatorAuth` mounted leaves such a request refused 401.
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
  type OperatorAuth,
} from '../src/index.ts'
import { provideBrowserCredentials } from './browser-credentials.ts'

const OPERATOR_HEADER = 'x-dsh-operator'
const OPERATOR_SECRET = 'o'.repeat(40)
const AUTHORITY = '127.0.0.1:3080'
const UNTRUSTED_AUTHORITY = 'evil.example:3080'

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

/** Read a header from an admitted request (record or Headers). */
function header(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** An operatorAuth that admits a request whose `x-dsh-operator` header equals the secret. */
const secretOperator: OperatorAuth = {
  verify: request => header(request.headers, OPERATOR_HEADER) === OPERATOR_SECRET,
}

async function mount(operatorAuth?: OperatorAuth): Promise<{
  ctx: Context
  routes: WebRoute[]
  connection: HostConnectionHandle
}> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  provideBrowserCredentials(ctx)
  ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
  if (operatorAuth !== undefined) ctx.provide('operatorAuth', operatorAuth)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, routes, connection: ctx.get('connection') as HostConnectionHandle }
}

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

describe('operator-auth seam', () => {
  it('admits a principal-less request carrying the operator secret, leaving no principal', async () => {
    const seam = await mount(secretOperator)
    expect(await postApi(seam, { [OPERATOR_HEADER]: OPERATOR_SECRET }))
      .toEqual({ status: 200, result: { ok: true, value: { seen: null } } })
  })

  it('refuses a request whose operator header does not match the secret', async () => {
    const seam = await mount(secretOperator)
    expect((await postApi(seam, { [OPERATOR_HEADER]: 'wrong' })).status).toBe(401)
  })

  it('refuses a request with no operator header', async () => {
    const seam = await mount(secretOperator)
    expect((await postApi(seam, {})).status).toBe(401)
  })

  it('fails the Host fence with 403 regardless of a matching operator header', async () => {
    const seam = await mount(secretOperator)
    expect((await postApi(seam, { host: UNTRUSTED_AUTHORITY, [OPERATOR_HEADER]: OPERATOR_SECRET })).status).toBe(403)
  })

  it('refuses with 401 when no operatorAuth is mounted', async () => {
    const seam = await mount()
    expect((await postApi(seam, { [OPERATOR_HEADER]: OPERATOR_SECRET })).status).toBe(401)
  })
})
