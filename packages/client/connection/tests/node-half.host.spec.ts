/** Node half: registers the /api prefix route bridging to the api gateway. */
import { EventEmitter, once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import { PassThrough, Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { RpcId, type ClientRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { WebServer, WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PATH, apply, HOST_EVENTS_PATH, inject, MUX_EVENTS_PATH, type HostConnectionHandle } from '../src/index.ts'

/** Structural webServer fake recording both route registries. */
function fakeHttpServer(
  routes: WebRoute[],
  upgrades: WebUpgradeRoute[],
): Pick<WebServer, 'register' | 'registerUpgrade' | 'tapIndex' | 'port'> {
  return {
    register(route) {
      if (routes.some(candidate => candidate.kind === route.kind && candidate.path === route.path)) {
        throw new Error(`duplicate route ${route.path}`)
      }
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
    registerUpgrade(route) {
      upgrades.push(route)
      return () => { upgrades.splice(upgrades.indexOf(route), 1) }
    },
    tapIndex: () => () => {},
    port: 0,
  }
}

/** Bodyless GET carrying the given headers (enough for the trust fence + bridge). */
function fakeRequest(headers: Record<string, string>, url = `${API_PATH}/session.list`): IncomingMessage {
  const request = Readable.from([]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'GET', headers })
  return request
}

/** JSON POST carrying a complete client-request envelope. */
function fakePost(headers: Record<string, string>, url: string, body: unknown): IncomingMessage {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'POST', headers: { 'content-type': 'application/json', ...headers } })
  return request
}

/** Raw POST for malformed-body and media-type boundary cases. */
function fakeRawPost(headers: Record<string, string>, url: string, body: string): IncomingMessage {
  const request = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage
  Object.assign(request, { url, method: 'POST', headers })
  return request
}

/** Response recorder compatible with both the fence's short-circuit and the bridge. */
function fakeResponse(): { response: ServerResponse; state: { status?: number; body?: unknown } } {
  const state: { status?: number; body?: unknown } = {}
  const chunks: Buffer[] = []
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(value: number) { state.status = value; return this },
    write(value: string | Uint8Array) { chunks.push(Buffer.from(value)); return true },
    end(this: { writableEnded: boolean }, value?: unknown) {
      if (typeof value === 'string' || value instanceof Uint8Array) chunks.push(Buffer.from(value))
      else if (value !== undefined) throw new TypeError('fake response only accepts string or Uint8Array bodies')
      if (chunks.length > 0) state.body = Buffer.concat(chunks).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return { response, state }
}

async function mounted(config?: {
  trustedHosts?: string[]
  auth?: { tokens: { name: string; token: string }[]; unpinned?: string[] }
}, webRuntime?: { trustedHosts?: string[]; apiToken?: string }): Promise<{
  routes: WebRoute[]
  upgrades: WebUpgradeRoute[]
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
  // A benign events stub so a WebSocket upgrade that passes the fence can reach
  // the downlink handler without a missing-method crash; the HTTP unary paths
  // still 404 through toFetchHandler before any method is read.
  ctx.provide('apiProxy', {
    events: { mux: async function* () {}, host: async function* () {} },
  } as unknown as ApiProxy)
  if (webRuntime !== undefined) ctx.provide('webRuntime', webRuntime as never)
  const fiber = ctx.plugin({ inject: [...inject], apply }, config)
  await fiber.await()
  return { routes, upgrades, dispose: () => fiber.dispose() }
}

describe('connection node half', () => {
  it('fails loud when the carrier cap cannot hold the configured image batch', () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
    ctx.provide('attachments', {
      imageLimits: { maxMessageImageBytes: 20 * 1024 * 1024 },
    } as AttachmentStore)
    ctx.provide('apiProxy', {} as ApiProxy)
    expect(() => { apply(ctx, { maxRequestBodyBytes: 1024 }) })
      .toThrow(/must be at least .* aggregate image limit/)
    expect(routes).toHaveLength(0)
  })

  it('fails the load on a trustedHosts entry that is not a bare authority', async () => {
    const routes: WebRoute[] = []
    const upgrades: WebUpgradeRoute[] = []
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
    ctx.provide('apiProxy', {} as unknown as ApiProxy)
    const fiber = ctx.plugin({ inject: [...inject], apply }, { trustedHosts: ['harness.internal/path'] })
    await expect(fiber).rejects.toThrow(/not a bare host\[:port\] authority/)
    expect(routes).toHaveLength(0)
    expect(upgrades).toHaveLength(0)
  })

  it('registers one HTTP route plus one upgrade route per downlink and removes all three with the fiber', async () => {
    const { routes, upgrades, dispose } = await mounted()
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'prefix', path: API_PATH })
    expect(upgrades.map(route => route.path)).toEqual([MUX_EVENTS_PATH, HOST_EVENTS_PATH])
    await dispose()
    expect(routes).toHaveLength(0)
    expect(upgrades).toHaveLength(0)
  })

  it('requires WebSocket upgrade for network GETs to either event path', async () => {
    const { routes, dispose } = await mounted()
    for (const path of [MUX_EVENTS_PATH, HOST_EVENTS_PATH]) {
      const { response, state } = fakeResponse()
      await routes[0]!.handler(fakeRequest({ host: '127.0.0.1:3080' }, path), response)
      expect(state.status).toBe(426)
      expect(state.body).toBe('upgrade required')
    }
    await dispose()
  })

  it('rejects an untrusted WebSocket upgrade before protocol negotiation', async () => {
    const { upgrades, dispose } = await mounted()
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    const ended = once(socket, 'end')
    await upgrades[0]!.handler(fakeRequest({
      host: 'harness.example', origin: 'http://harness.example', 'sec-fetch-site': 'same-origin',
    }, MUX_EVENTS_PATH), socket, Buffer.alloc(0))
    await ended
    expect(Buffer.concat(chunks).toString()).toContain('HTTP/1.1 403 Forbidden')
    await dispose()
  })

  it('refuses an untrusted Host on any /api path before the bridge runs', async () => {
    const { routes, dispose } = await mounted()
    const { response, state } = fakeResponse()
    await routes[0]!.handler(fakeRequest({
      host: 'harness.example', origin: 'http://harness.example', 'sec-fetch-site': 'same-origin',
    }), response)
    expect(state.status).toBe(403)
    expect(state.body).toBe('forbidden')
    await dispose()
  })

  it('pins privileged methods to loopback even for a declared trusted authority', async () => {
    const { routes, dispose } = await mounted({ trustedHosts: ['harness.example'] })
    // The privileged set: native dialogs plus the whole settings/credential
    // configuration plane, reads included, plus the one method that makes the
    // host fetch a caller-chosen URL. The same declared authority reaches
    // ordinary reads (carrier-level 404 from the empty proxy proves the fence
    // passed), but each privileged method stays loopback-only and 403s.
    for (const method of [
      'host.pickDirectory', 'host.openPath',
      'settings.describe', 'settings.openDocument', 'settings.update', 'settings.replace', 'settings.mutate',
      'credentials.describe', 'credentials.set', 'credentials.unset',
      'llm.discoverModels',
      // A composition names the plugins a session runs: reading one is
      // reconnaissance, and copy/remove/openDocument manage the roster and
      // drive the host desktop.
      'agentPreset.read', 'agentPreset.copy', 'agentPreset.openDocument', 'agentPreset.remove',
    ]) {
      const denied = fakeResponse()
      await routes[0]!.handler(
        fakeRequest({ host: 'harness.example' }, `${API_PATH}/${method}`),
        denied.response,
      )
      expect(denied.state.status).toBe(403)
      expect(denied.state.body).toBe('forbidden')
    }
    const read = fakeResponse()
    await routes[0]!.handler(fakeRequest({ host: 'harness.example' }), read.response)
    expect(read.state.status).not.toBe(403)
    await dispose()
  })

  it('passes loopback and declared-authority requests through to the bridge', async () => {
    const { routes, dispose } = await mounted({ trustedHosts: ['harness.example:3080', '192.168.1.5'] })
    // Loopback, no browser markers (curl shape): the fence passes; the carrier
    // answers 404 for a GET unary path — proof the bridge ran.
    const loopback = fakeResponse()
    await routes[0]!.handler(fakeRequest({ host: '127.0.0.1:3080' }), loopback.response)
    expect(loopback.state.status).toBe(404)
    // An all-interfaces composition derives port-less LAN IP literals, which
    // pass markerless curl on any port.
    const lan = fakeResponse()
    await routes[0]!.handler(fakeRequest({ host: '192.168.1.5:3080' }), lan.response)
    expect(lan.state.status).toBe(404)
    // Declared public authority, same-origin browser shape.
    const declared = fakeResponse()
    await routes[0]!.handler(fakeRequest({
      host: 'harness.example:3080', origin: 'http://harness.example:3080', 'sec-fetch-site': 'same-origin',
    }), declared.response)
    expect(declared.state.status).toBe(404)
    await dispose()
  })

  describe('bearer-token authentication', () => {
    const TOKEN = 'z'.repeat(32)
    const authConfig = { tokens: [{ name: 'odoo', token: TOKEN }], unpinned: ['agentPreset.read'] }
    const bearer = { authorization: `Bearer ${TOKEN}` }

    it('ignores an Authorization header entirely when no auth is configured', async () => {
      const { routes, dispose } = await mounted()
      const { response, state } = fakeResponse()
      // Remote Host, valid-looking token, but auth disabled → the fence is
      // unchanged and refuses the untrusted Host.
      await routes[0]!.handler(fakeRequest({ host: 'harness.example', ...bearer }), response)
      expect(state.status).toBe(403)
      await dispose()
    })

    it('lets a valid token pass the reachability fence from an untrusted Host', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig })
      const { response, state } = fakeResponse()
      // Remote server client (no loopback, not declared) with a valid token:
      // the fence passes; the carrier answers 404 for the GET unary path.
      await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', ...bearer }), response)
      expect(state.status).toBe(404)
      await dispose()
    })

    it('answers 401 for a present-but-unknown token instead of falling back to reachability', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig })
      const { response, state } = fakeResponse()
      await routes[0]!.handler(
        fakeRequest({ host: 'odoo.remote:8069', authorization: `Bearer ${'w'.repeat(32)}` }),
        response,
      )
      expect(state.status).toBe(401)
      expect(state.body).toBe('invalid api token')
      await dispose()
    })

    it('lets an authenticated client call a pin listed in auth.unpinned', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig })
      const { response, state } = fakeResponse()
      // agentPreset.read is pinned but listed in unpinned → allowed with a token
      // from a remote Host; carrier 404 (GET on a POST method) proves it passed.
      await routes[0]!.handler(
        fakeRequest({ host: 'odoo.remote:8069', ...bearer }, `${API_PATH}/agentPreset.read`),
        response,
      )
      expect(state.status).toBe(404)
      await dispose()
    })

    it('still refuses a pin NOT listed in auth.unpinned even with a valid token', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig })
      const { response, state } = fakeResponse()
      // agentPreset.copy is pinned and NOT unpinned → loopback-only, so a remote
      // authenticated client is refused.
      await routes[0]!.handler(
        fakeRequest({ host: 'odoo.remote:8069', ...bearer }, `${API_PATH}/agentPreset.copy`),
        response,
      )
      expect(state.status).toBe(403)
      await dispose()
    })

    it('keeps unauthenticated pins loopback-only exactly as before', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig, trustedHosts: ['harness.example'] })
      // A declared-authority client with NO token: the pin stays loopback-only.
      const remote = fakeResponse()
      await routes[0]!.handler(fakeRequest({ host: 'harness.example' }, `${API_PATH}/agentPreset.read`), remote.response)
      expect(remote.state.status).toBe(403)
      // The same pin from loopback with no token passes (the SPA path).
      const loopback = fakeResponse()
      await routes[0]!.handler(fakeRequest({ host: '127.0.0.1:3080' }, `${API_PATH}/agentPreset.read`), loopback.response)
      expect(loopback.state.status).toBe(404)
      await dispose()
    })

    it('never lets a token bypass the CSRF fence for a browser-marked request', async () => {
      const { routes, dispose } = await mounted({ auth: authConfig })
      const { response, state } = fakeResponse()
      // A page carrying a stolen token attaches a cross-site marker → the token
      // bypass is off and the reachability fence refuses it.
      await routes[0]!.handler(fakeRequest({
        host: 'odoo.remote:8069', origin: 'http://evil.example', 'sec-fetch-site': 'cross-site', ...bearer,
      }), response)
      expect(state.status).toBe(403)
      await dispose()
    })

    it('rejects a WebSocket upgrade carrying an unknown token', async () => {
      const { upgrades, dispose } = await mounted({ auth: authConfig })
      const socket = new PassThrough()
      const chunks: Buffer[] = []
      socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      const ended = once(socket, 'end')
      await upgrades[0]!.handler(
        fakeRequest({ host: 'odoo.remote:8069', authorization: `Bearer ${'w'.repeat(32)}` }, MUX_EVENTS_PATH),
        socket, Buffer.alloc(0),
      )
      await ended
      expect(Buffer.concat(chunks).toString()).toContain('HTTP/1.1 403 Forbidden')
      await dispose()
    })

    it('lets a valid token past the WebSocket upgrade fence to the downlink handler', async () => {
      // A valid token from an untrusted Host passes the SAME reachability
      // decision the HTTP route uses, so the upgrade proceeds into the downlink
      // handler (which then reaches the api gateway — here the empty test proxy,
      // proving the fence did NOT reject the upgrade).
      const { upgrades, dispose } = await mounted({ auth: authConfig })
      const socket = new PassThrough()
      const chunks: Buffer[] = []
      socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      await upgrades[0]!.handler(fakeRequest({
        host: 'odoo.remote:8069',
        ...bearer,
        upgrade: 'websocket',
        connection: 'Upgrade',
        'sec-websocket-key': Buffer.from('0123456789abcdef').toString('base64'),
        'sec-websocket-version': '13',
      }, MUX_EVENTS_PATH), socket, Buffer.alloc(0))
      // The handshake completed (101) before the downlink read the empty proxy;
      // a rejected upgrade would have written 403 and never handshaked.
      const written = Buffer.concat(chunks).toString()
      expect(written).toContain('HTTP/1.1 101')
      expect(written).not.toContain('403')
      await dispose()
    })

    it('fails the load when a token is shorter than the minimum length', async () => {
      const routes: WebRoute[] = []
      const ctx = new Context()
      ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
      ctx.provide('apiProxy', {} as unknown as ApiProxy)
      const fiber = ctx.plugin({ inject: [...inject], apply }, { auth: { tokens: [{ name: 'x', token: 'short' }] } })
      await expect(fiber).rejects.toThrow(/must be at least 16 characters/)
      expect(routes).toHaveLength(0)
    })

    it('fails the load when an unpinned entry is not a pinned method', async () => {
      const routes: WebRoute[] = []
      const ctx = new Context()
      ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
      ctx.provide('apiProxy', {} as unknown as ApiProxy)
      const fiber = ctx.plugin({ inject: [...inject], apply }, {
        auth: { tokens: [{ name: 'x', token: 'z'.repeat(32) }], unpinned: ['session.list'] },
      })
      await expect(fiber).rejects.toThrow(/is not a pinned method/)
      expect(routes).toHaveLength(0)
    })

    describe('defaults derived from a mounted webRuntime', () => {
      const runtime = { trustedHosts: ['app.internal'], apiToken: TOKEN }

      it('derives auth from webRuntime.apiToken: a valid token passes the fence and reaches the four unpinned pins', async () => {
        const { routes, dispose } = await mounted(undefined, runtime)
        // No explicit config, but webRuntime.apiToken derives auth: a valid token
        // from an untrusted Host passes, and agentPreset.read (a default unpinned
        // pin) is callable — carrier 404 (GET) proves it got past the pin.
        const passed = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', ...bearer }, `${API_PATH}/agentPreset.read`), passed.response)
        expect(passed.state.status).toBe(404)
        // A pin NOT in the default unpinned set stays loopback-only.
        const denied = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', ...bearer }, `${API_PATH}/settings.update`), denied.response)
        expect(denied.state.status).toBe(403)
        await dispose()
      })

      it('inherits trustedHosts from webRuntime when the deployment names none', async () => {
        const { routes, dispose } = await mounted(undefined, runtime)
        // app.internal is not loopback and not in explicit config; it reaches
        // ordinary reads because trustedHosts inherited webRuntime.trustedHosts.
        const declared = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'app.internal', origin: 'http://app.internal', 'sec-fetch-site': 'same-origin' }), declared.response)
        expect(declared.state.status).toBe(404)
        await dispose()
      })

      it('leaves auth disabled and loopback-only when no webRuntime is mounted', async () => {
        const { routes, dispose } = await mounted()
        // No webRuntime, no config: a token is ignored (auth off) and the Host
        // fence refuses an untrusted Host — exactly today's behavior.
        const refused = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', ...bearer }), refused.response)
        expect(refused.state.status).toBe(403)
        await dispose()
      })

      it('lets explicit config override the webRuntime-derived defaults wholesale', async () => {
        // Explicit auth with a DIFFERENT token: the webRuntime token no longer
        // authenticates, and only the explicit unpinned list applies.
        const explicitToken = 'q'.repeat(32)
        const { routes, dispose } = await mounted(
          { trustedHosts: ['explicit.host'], auth: { tokens: [{ name: 'x', token: explicitToken }], unpinned: ['agentPreset.copy'] } },
          runtime,
        )
        // The webRuntime token is now unknown → 401.
        const runtimeToken = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', authorization: `Bearer ${TOKEN}` }), runtimeToken.response)
        expect(runtimeToken.state.status).toBe(401)
        // The explicit token authenticates and reaches its explicit unpinned pin.
        const ok = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'odoo.remote:8069', authorization: `Bearer ${explicitToken}` }, `${API_PATH}/agentPreset.copy`), ok.response)
        expect(ok.state.status).toBe(404)
        // webRuntime.trustedHosts is NOT inherited: app.internal is refused,
        // explicit.host is not (explicit config replaced the derived list).
        const derivedHost = fakeResponse()
        await routes[0]!.handler(fakeRequest({ host: 'app.internal' }), derivedHost.response)
        expect(derivedHost.state.status).toBe(403)
        await dispose()
      })
    })
  })

  it('provides a disposable dedicated RPC channel without requiring apiProxy', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'prefix', path: API_PATH })

    const connection = ctx.get('connection') as HostConnectionHandle
    const calls: unknown[] = []
    const remove = connection.rpc.handle('/rpc', async (endpoint, payload) => {
      calls.push({ endpoint, payload })
      return { ok: true, value: { accepted: true } }
    }, { authority: 'trusted-host' })
    const route = routes.find(candidate => candidate.path === '/rpc')
    expect(route).toBeDefined()

    const request: ClientRequest = {
      type: 'client-request',
      rpcId: RpcId('rpc-dedicated'),
      method: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    }
    const result = fakeResponse()
    await route!.handler(fakePost({ host: '127.0.0.1:3080' }, '/rpc/goals/create', request), result.response)
    expect(result.state.status).toBe(200)
    expect(JSON.parse(String(result.state.body))).toEqual({
      type: 'server-response',
      rpcId: 'rpc-dedicated',
      result: { ok: true, value: { accepted: true } },
    })
    expect(calls).toEqual([{
      endpoint: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    }])

    expect(() => connection.rpc.handle('/rpc', async () => ({ ok: true, value: null }), {
      authority: 'trusted-host',
    })).toThrow(/duplicate route/)
    await remove()
    expect(routes.map(candidate => candidate.path)).toEqual([API_PATH])
    await fiber.dispose()
    expect(routes).toHaveLength(0)
  })

  it('dispatches claimed /api endpoints before the API Proxy fallback and withdraws the claim', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
    ctx.provide('apiProxy', {} as unknown as ApiProxy)
    const fiber = ctx.plugin({ inject: [...inject], apply }, { trustedHosts: ['harness.example'] })
    await fiber.await()
    const connection = ctx.get('connection') as HostConnectionHandle
    const calls: unknown[] = []
    const remove = connection.rpc.intercept(
      '/api',
      endpoint => endpoint === 'goals/create',
      async (endpoint, payload) => {
        calls.push({ endpoint, payload })
        return { ok: true, value: { accepted: true } }
      },
      { authority: 'trusted-host' },
    )
    expect(() => connection.rpc.intercept(
      '/api',
      () => true,
      async () => ({ ok: true, value: null }),
      { authority: 'trusted-host' },
    )).toThrow('already has an interceptor')
    expect(() => connection.rpc.intercept(
      '/rpc' as '/api',
      () => true,
      async () => ({ ok: true, value: null }),
      { authority: 'trusted-host' },
    )).toThrow('invalid shared RPC channel')
    const route = routes.find(candidate => candidate.path === API_PATH)!
    const request: ClientRequest = {
      type: 'client-request',
      rpcId: RpcId('rpc-shared'),
      method: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    }

    const claimed = fakeResponse()
    await route.handler(fakePost({ host: '127.0.0.1:3080' }, '/api/goals/create', request), claimed.response)
    expect(JSON.parse(String(claimed.state.body))).toEqual({
      type: 'server-response',
      rpcId: 'rpc-shared',
      result: { ok: true, value: { accepted: true } },
    })
    expect(calls).toEqual([{
      endpoint: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    }])

    const denied = fakeResponse()
    await route.handler(fakePost({ host: 'other.example' }, '/api/goals/create', request), denied.response)
    expect(denied.state).toMatchObject({ status: 403, body: 'forbidden' })
    expect(calls).toHaveLength(1)

    const unclaimed = fakeResponse()
    await route.handler(fakeRequest({ host: '127.0.0.1:3080' }, '/api/session.list'), unclaimed.response)
    expect(unclaimed.state.status).toBe(404)

    await remove()
    const withdrawn = fakeResponse()
    await route.handler(fakePost({ host: '127.0.0.1:3080' }, '/api/goals/create', request), withdrawn.response)
    expect(withdrawn.state.status).toBe(404)
    expect(calls).toHaveLength(1)

    const removeLoopback = connection.rpc.intercept(
      '/api',
      endpoint => endpoint === 'goals/create',
      async () => ({ ok: true, value: null }),
      { authority: 'loopback' },
    )
    const loopbackOnly = fakeResponse()
    await route.handler(fakePost({ host: 'harness.example' }, '/api/goals/create', request), loopbackOnly.response)
    expect(loopbackOnly.state.status).toBe(403)
    await removeLoopback()
    await fiber.dispose()
  })

  it('applies the configured trust fence and JSON envelope checks to generic channels', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeHttpServer(routes, []) as WebServer)
    const fiber = ctx.plugin({ inject: [...inject], apply }, { trustedHosts: ['harness.example'] })
    await fiber.await()
    const connection = ctx.get('connection') as HostConnectionHandle
    const remove = connection.rpc.handle('/rpc', async (endpoint) => {
      if (endpoint === 'fail') throw new Error('handler broke')
      return { ok: true, value: null }
    }, {
      authority: 'trusted-host',
    })
    const route = routes.find(candidate => candidate.path === '/rpc')!

    const denied = fakeResponse()
    await route.handler(fakePost({ host: 'other.example' }, '/rpc/goals/create', {}), denied.response)
    expect(denied.state).toMatchObject({ status: 403, body: 'forbidden' })

    const methodMismatch = fakeResponse()
    await route.handler(fakePost({ host: 'harness.example' }, '/rpc/goals/create', {
      type: 'client-request', rpcId: 'rpc-bad', method: 'other', payload: {},
    }), methodMismatch.response)
    expect(JSON.parse(String(methodMismatch.state.body))).toMatchObject({
      rpcId: 'rpc-bad',
      result: { ok: false, error: { code: 'bad-request' } },
    })

    for (const [request, status] of [
      [fakeRequest({ host: 'harness.example' }, '/rpc/goals/create'), 404],
      [fakePost({ host: 'harness.example' }, '/outside/goals/create', {}), 404],
      [fakePost({ host: 'harness.example' }, '/rpc/goals//create', {}), 404],
      [fakeRawPost({ host: 'harness.example' }, '/rpc/goals/create', '{}'), 415],
      [fakeRawPost({ host: 'harness.example', 'content-type': 'text/plain' }, '/rpc/goals/create', '{}'), 415],
      [fakeRawPost({ host: 'harness.example', 'content-type': 'application/json; charset=utf-8' }, '/rpc/goals/create', '{'), 400],
    ] as const) {
      const response = fakeResponse()
      await route.handler(request, response.response)
      expect(response.state.status).toBe(status)
    }

    for (const [body, rpcId] of [
      [{ rpcId: 'retained-id' }, 'retained-id'],
      [{ rpcId: 42 }, 'invalid-request'],
      [null, 'invalid-request'],
    ] as const) {
      const response = fakeResponse()
      await route.handler(fakePost({ host: 'harness.example' }, '/rpc/goals/create', body), response.response)
      expect(JSON.parse(String(response.state.body))).toMatchObject({
        rpcId,
        result: { ok: false, error: { code: 'bad-request' } },
      })
    }

    const failed = fakeResponse()
    await route.handler(fakePost({ host: 'harness.example' }, '/rpc/fail', {
      type: 'client-request', rpcId: 'rpc-fail', method: 'fail', payload: {},
    }), failed.response)
    expect(failed.state).toMatchObject({ status: 500, body: 'handler failure: Error: handler broke' })

    expect(() => connection.rpc.handle('/api', async () => ({ ok: true, value: null }), {
      authority: 'loopback',
    })).toThrow('invalid or reserved RPC channel')
    expect(() => connection.rpc.handle('api3', async () => ({ ok: true, value: null }), {
      authority: 'loopback',
    })).toThrow('invalid or reserved RPC channel')

    const removeLoopback = connection.rpc.handle('/loopback', async () => ({ ok: true, value: null }), {
      authority: 'loopback',
    })
    const loopbackRoute = routes.find(candidate => candidate.path === '/loopback')!
    const publicResponse = fakeResponse()
    await loopbackRoute.handler(fakePost({ host: 'harness.example' }, '/loopback/read', {
      type: 'client-request', rpcId: 'rpc-public', method: 'read', payload: {},
    }), publicResponse.response)
    expect(publicResponse.state.status).toBe(403)
    await removeLoopback()
    await remove()
    await fiber.dispose()
  })
})

describe('connection node half over a real HTTP server', () => {
  /** Serve the registered prefix route from a real server and return its port. */
  async function serve(routes: WebRoute[]): Promise<{ port: number; close: () => Promise<void> }> {
    const server = createServer((request, response) => {
      void routes[0]!.handler(request, response)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    return {
      port: address.port,
      close: () => new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined || error === null) resolve()
          else reject(error)
        })
      }),
    }
  }

  /** One real request; `host` spoofs the authority the way a LAN client's browser would send it. */
  function call(port: number, method: string, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        { host: '127.0.0.1', port, path: `${API_PATH}/${method}`, method: 'GET', headers: { host } },
        (response) => {
          response.resume()
          response.on('end', () => { resolve(response.statusCode ?? 0) })
        },
      )
      request.on('error', reject)
      request.end()
    })
  }

  it('answers a declared LAN authority with 403 on every configuration method, over real HTTP', async () => {
    // The fence's input is a real IncomingMessage parsed by Node from the
    // wire, not a hand-assembled object: the Host header a LAN browser sends
    // is exactly what decides loopback-only here, so the boundary is asserted
    // against the parse the server actually performs.
    const { routes, dispose } = await mounted({ trustedHosts: ['harness.example'] })
    const { port, close } = await serve(routes)
    try {
      // Reads are as privileged as writes: describe returns the exposed
      // configuration, and credentials.describe probes arbitrary env-var names.
      for (const method of [
        'settings.describe', 'settings.openDocument', 'settings.update', 'settings.replace', 'settings.mutate',
        'credentials.describe', 'credentials.set', 'credentials.unset',
        'host.pickDirectory', 'host.openPath',
        // Carries a draft credential and turns the host into a fetcher for a
        // URL the caller picked: an anonymous LAN caller must not reach it.
        'llm.discoverModels',
        'agentPreset.read', 'agentPreset.copy', 'agentPreset.openDocument', 'agentPreset.remove',
      ]) {
        expect([method, await call(port, method, 'harness.example')]).toEqual([method, 403])
      }
      // The model catalog stays reachable for the same authority: a LAN
      // client's model picker needs it, and it carries no key or endpoint
      // state (404 is the empty proxy's carrier answer — the fence passed).
      // `agentPreset.list` joins the model catalog for the same reason: ids and
      // trust only, and a LAN client's preset picker needs it. `select` is
      // reachable too: `session.create` already takes an `agentPreset`, and the
      // deployment's own default already carries bash, so pinning the switch
      // would be a fence beside an open gate.
      for (const method of ['llm.providers', 'llm.models', 'agentPreset.list', 'agentPreset.select']) {
        expect([method, await call(port, method, 'harness.example')]).toEqual([method, 404])
      }
      // Loopback reaches everything, configuration included.
      expect(await call(port, 'settings.describe', `127.0.0.1:${String(port)}`)).toBe(404)
    } finally {
      await close()
      await dispose()
    }
  })
})
