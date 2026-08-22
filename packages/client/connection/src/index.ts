/** Host HTTP bridge for browser-client RPC. */
import type { IncomingHttpHeaders } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
// Activates the webServer Context merge used below.
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.ts'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.ts'
import { assertTrustedAuthority, isTrustedApiRequest } from './api-request-trust.ts'
import {
  authenticateApiRequest, deriveWebRuntimeAuth, prepareApiAuth, requestHasBrowserMarker,
  resolveHttpPrincipal, ticketChallenge,
  type ApiAuthConfig, type ApiAuthInvalidReason, type ApiPrincipal,
} from './api-auth.ts'
import { sessionScopeOf } from '@deepseek-ai/dsh-host-apiproxy'
// Type-only: resolves `ctx.get('sessionAccess')` for the remote-gateway ACL guard.
import type {} from '@deepseek-ai/dsh-session-access'
import { HostConnectionService, type RemoteAclGuard } from './rpc-host.ts'
import { rejectWebSocketUpgrade, WebSocketDownlinks } from './websocket-downlink.ts'

export type {
  ConnectionRpcAuthority,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  ConnectionRpcHandlerOptions,
  HostConnectionHandle,
  HostConnectionRpc,
} from './rpc.ts'
export { HostConnectionService } from './rpc-host.ts'

export { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.ts'
export { prepareApiAuth } from './api-auth.ts'
export type { ApiAuthConfig, ApiAuthTokenConfig, PreparedApiAuth } from './api-auth.ts'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024

function assertImageBodyCapacity(ctx: Context, maxRequestBodyBytes: number): void {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection; API Proxy is an optional `/api` fallback. */
export const inject = ['webServer']

/** Plugin config: the deployment's non-loopback serving authorities. */
export interface ConnectionConfig {
  /**
   * Authorities this deployment serves beyond loopback: exact `host:port`, or
   * port-less `host` matching any port. The /api trust fence refuses any
   * request whose Host is neither loopback nor listed here, so a
   * non-loopback (`0.0.0.0`) deployment must declare the names it is reached
   * by (the dsh CLI derives the machine's LAN IP literals itself). An entry
   * that is not a bare, canonical authority fails the plugin load.
   */
  trustedHosts?: string[]
  /** Maximum buffered JSON body for every `/api` request. */
  maxRequestBodyBytes?: number
  /**
   * Optional Bearer-token authentication. With no tokens configured the /api
   * surface behaves exactly as today (reachability fence + loopback pins). A
   * request whose `Authorization: Bearer <token>` matches a configured token
   * passes the reachability fence from any Host and may additionally call the
   * pinned methods listed in `unpinned`. Browser CSRF rules are never bypassed
   * by a token. See [api-auth](./api-auth.ts).
   */
  auth?: ApiAuthConfig
}

export const Config: z<ConnectionConfig> = z.object({
  trustedHosts: z.array(String).default([]),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
  // Cast the auth field to its output type: schemastery infers the nested
  // token object's INPUT as `{name?, token?}`, which trips exactOptional
  // assignability against `ApiAuthConfig`; the runtime shape is exactly it.
  auth: z.object({
    tokens: z.array(z.object({
      name: z.string().required(),
      token: z.string().required(),
    })).default([]),
    unpinned: z.array(z.string()).default([]),
    // Per-user ticket auth. The secret defaults to empty (ticket auth
    // disabled); prepareTicketAuth fails loud on a present-but-short secret.
    ticket: z.object({
      secret: z.string().default(''),
      maxTtlSeconds: z.natural().min(1),
      clockSkewSeconds: z.natural(),
    }),
  }) as unknown as z<ApiAuthConfig>,
})

/**
 * Methods gated to loopback even on a trusted-host deployment. Native dialogs
 * act on the host machine; the settings and credential domains mutate the
 * user's configuration and secret store, and READING them is equally
 * privileged — `settings.describe` returns every exposed namespace's
 * configuration and `credentials.describe` reports whether an arbitrary
 * environment-variable name is configured and where from, which is
 * reconnaissance no anonymous caller should have. `trustedHosts` is a
 * DNS-rebinding fence, explicitly not authentication, so the whole
 * configuration plane stays loopback-same-origin until a real authentication
 * layer exists. `llm.discoverModels` belongs to that plane on both counts: it
 * carries a draft credential, and it makes the HOST issue a GET to a URL the
 * caller chose and reports back the status or the parsed body — an anonymous
 * LAN caller would have a probe for whatever the host can reach and the
 * browser cannot.
 *
 * The model catalog (`llm.providers`, `llm.models`) is deliberately NOT here:
 * it carries provider ids, display names, and model lists — no endpoints,
 * keys, or key state — and a LAN client's model picker legitimately needs it.
 */
const PRIVILEGED_METHODS = new Set([
  // A preset composition names the plugins a session runs, so reading one is
  // reconnaissance; copy and remove rearrange what the deployment offers, and
  // openDocument drives the host desktop — all more than the roster beside
  // them. (Authoring is copy-only, so no method here accepts composition text
  // or a path; the pin is about who may manage the roster at all.)
  //
  // CHOOSING one is not pinned, and `agentPreset.list` is not either. Picking a
  // preset looks like escalation — one of them mounts the toolset that edits the
  // live runtime — but `session.create` already takes an `agentPreset`, so
  // pinning only the switch would leave the same capability one method over.
  // The deeper reason is that the capability is not the preset's to grant: the
  // deployment's own default already carries `bash` and the filesystem tools, so
  // any caller that may start a session at all can already run commands as this
  // process. Pinning the switch would be a fence beside an open gate.
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

/**
 * Mounts the API gateway under the browser transport prefix. Every request on
 * the prefix passes the browser-trust fence first (DNS-rebinding and
 * cross-site defense — [api-request-trust](./api-request-trust.ts)); privileged
 * methods additionally pass it with an empty trust list, which pins them to
 * loopback. When `auth` is configured ([api-auth](./api-auth.ts)), a valid
 * Bearer token additionally passes the reachability fence from any Host and
 * lets a client call the pins listed in `auth.unpinned`; browser CSRF rules are
 * never bypassed, and an unknown token answers 401.
 *
 * `trustedHosts` and `auth` default from an optional `webRuntime` service when
 * the deployment configures neither: `trustedHosts` inherits
 * `webRuntime.trustedHosts`, and `auth` derives a `web` token granting
 * {@link DEFAULT_UNPINNED_METHODS} from `webRuntime.apiToken`
 * ({@link deriveWebRuntimeAuth}). A composition mounting this plugin beside the
 * web runtime is therefore mandatory-auth by default; one without a webRuntime
 * stays loopback-only and fence-only. Explicit config always wins wholesale.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config?: ConnectionConfig): void {
  // Read the optional web runtime through the global store (never a declared
  // inject: this plugin stays composable without web-app). The web-app patch
  // keeps `inject: [webRuntime]` on this row purely for start ordering, so the
  // value is present here whenever a webRuntime exists.
  const webRuntime = ctx.get('webRuntime') as { trustedHosts?: string[]; apiToken?: string; ticketSecret?: string } | undefined
  // Default `trustedHosts` and `auth` from the web runtime when the deployment
  // configured neither (schemastery materializes an absent list/block to empty,
  // so "empty" is the absence signal). Explicit config replaces the default.
  const configuredHosts = config?.trustedHosts ?? []
  const trustedHosts = configuredHosts.length > 0 ? configuredHosts : (webRuntime?.trustedHosts ?? [])
  const configuredAuth = config?.auth
  // Explicit auth wins when it configures anything real — a token OR a ticket
  // secret; otherwise fall back to the web runtime's derived token auth.
  const hasExplicitAuth = configuredAuth !== undefined
    && (configuredAuth.tokens.length > 0 || (configuredAuth.ticket?.secret.length ?? 0) > 0)
  const authConfig = hasExplicitAuth
    ? configuredAuth
    : deriveWebRuntimeAuth(webRuntime?.apiToken, webRuntime?.ticketSecret)
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  // Same boundary for the effective auth block: a token below the minimum
  // length or an `unpinned` entry outside the pinned set fails the load.
  // Undefined = authentication disabled (today's behavior).
  const preparedAuth = prepareApiAuth(authConfig, PRIVILEGED_METHODS)
  // The caller identity threaded into dispatch and the stream openers. Only
  // reached after the fence admits the request. A resolved ticket carries its
  // user; a credential-less request is full-token when ticket auth is off
  // (byte-for-byte the pre-ticket behavior) and fail-closed `anonymous` once
  // `auth.ticket` is configured — see `resolveHttpPrincipal`.
  const principalOf = (headers: IncomingHttpHeaders | Headers): ApiPrincipal =>
    resolveHttpPrincipal(headers, preparedAuth)
  if (ctx.get('apiProxy') !== undefined) assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  // Remote-gateway ACL: the Typert gateway serves session-scoped remote methods
  // (messageFeedback/*, commands/list) OFF the ApiProxy dispatch, so a ticket
  // caller is gated here at the carrier before the gateway sees the call. Full
  // token bypasses; a ticket needs access to the call's session; an anonymous
  // caller — or a ticket call with no extractable session id while ticket auth
  // is on — is denied (the SPA's remote calls are all session-scoped).
  const remoteAclGuard: RemoteAclGuard = (request, _endpoint, payload) => {
    const principal = principalOf(request.headers)
    if (principal.kind === 'token') return undefined
    const sessionId = sessionScopeOf(payload)
    const access = ctx.get('sessionAccess')
    if (principal.kind === 'ticket' && sessionId !== undefined && (access?.canRead(principal, sessionId) ?? false)) {
      return undefined
    }
    return {
      code: 'forbidden',
      message: sessionId === undefined ? 'not authorized for this remote method' : `not authorized for session ${sessionId}`,
      details: sessionId === undefined ? {} : { sessionId },
    }
  }
  const connection = new HostConnectionService(ctx, trustedHosts, remoteAclGuard)
  const fetchHandler = connection.createSharedFetchHandler(API_PATH, {
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      const method = pathname.startsWith(`${API_PATH}/`)
        ? pathname.slice(API_PATH.length + 1)
        : undefined
      if (method !== undefined && PRIVILEGED_METHODS.has(method)) {
        // A pinned method is loopback-only, EXCEPT when an authenticated client
        // (valid token) calls one the deployment listed in `auth.unpinned`.
        const loopbackOk = isTrustedApiRequest(request, [])
        // Only a FULL token unlocks unpinned/privileged methods; a per-user
        // ticket never does — it is a scoped runtime credential, not a
        // management principal.
        const auth = authenticateApiRequest(request.headers, preparedAuth)
        const fullToken = auth.status === 'ok' && auth.principal.kind === 'token'
        const unpinnedOk = fullToken && preparedAuth?.unpinned.has(method) === true
        if (!loopbackOk && !unpinnedOk) {
          return new Response('forbidden', { status: 403 })
        }
      }
      if (request.method === 'GET' && (pathname === MUX_EVENTS_PATH || pathname === HOST_EVENTS_PATH)) {
        return new Response('upgrade required', {
          status: 426,
          headers: { connection: 'Upgrade', upgrade: 'websocket' },
        })
      }
      const apiProxy = ctx.get('apiProxy')
      if (apiProxy === undefined) return new Response('not found', { status: 404 })
      return toFetchHandler(apiProxy, principalOf(request.headers)).fetch(request)
    },
  })
  // The reachability decision shared by the HTTP route and the WS upgrades: a
  // request passes when its Host is ours OR it presents a valid token AND
  // carries no browser marker (so a stolen token cannot be replayed cross-site
  // — a marked request always goes through the full fence). A present-but-
  // unknown token is `unauthorized`, never silently downgraded to reachability.
  const reachableOrAuthenticated = (
    request: { headers: IncomingHttpHeaders | Headers },
  ): { decision: 'ok' | 'unauthorized' | 'forbidden'; reason?: ApiAuthInvalidReason } => {
    const auth = authenticateApiRequest(request.headers, preparedAuth)
    if (auth.status === 'invalid') return { decision: 'unauthorized', reason: auth.reason }
    const reachable = isTrustedApiRequest(request, trustedHosts)
      || (auth.status === 'ok' && !requestHasBrowserMarker(request.headers))
    return reachable ? { decision: 'ok' } : { decision: 'forbidden' }
  }
  const route: WebRoute = {
    kind: 'prefix',
    path: API_PATH,
    handler: async (req, res) => {
      const { decision, reason } = reachableOrAuthenticated(req)
      if (decision === 'unauthorized') {
        // A ticket failure carries a WWW-Authenticate hint so the SPA can tell
        // "refresh the ticket" (expired) from "credential is bogus" (invalid),
        // both distinct from a 403 "not allowed this session". An unknown full
        // token stays header-less, exactly as before ticket auth existed.
        const challenge = ticketChallenge(reason)
        if (challenge !== undefined) res.writeHead(401, { 'www-authenticate': challenge })
        else res.writeHead(401)
        res.end('invalid api token')
        return
      }
      if (decision === 'forbidden') {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      await bridge(req, res, fetchHandler, maxRequestBodyBytes)
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'client-connection: /api route')
  ctx.inject(['apiProxy'], (apiCtx) => {
    assertImageBodyCapacity(apiCtx, maxRequestBodyBytes)
    const downlinks = new WebSocketDownlinks(apiCtx.apiProxy)
    const registerDownlink = (
      path: string,
      handle: WebUpgradeRoute['handler'],
    ): void => {
      apiCtx.effect(() => apiCtx.webServer.registerUpgrade({
        path,
        handler: (req, socket, head) => {
          // A raw upgrade cannot carry a clean 401 body, so an invalid token is
          // rejected like any other refusal. Browsers cannot set a WS request
          // header, but the handshake DOES carry cookies, so the same-origin SPA
          // authenticates through its HttpOnly ticket cookie; server-side WS
          // clients may still use an Authorization header. Both resolve the same
          // principal via `principalOf` below.
          if (reachableOrAuthenticated(req).decision !== 'ok') {
            rejectWebSocketUpgrade(socket)
            return
          }
          return handle(req, socket, head)
        },
      }), `client-connection: ${path} WebSocket`)
    }
    apiCtx.effect(() => () => downlinks.close(), 'client-connection: WebSocket downlinks')
    registerDownlink(MUX_EVENTS_PATH, (req, socket, head) => { downlinks.handleMux(req, socket, head, principalOf(req.headers)) })
    registerDownlink(HOST_EVENTS_PATH, (req, socket, head) => { downlinks.handleHost(req, socket, head, principalOf(req.headers)) })
  })
}
