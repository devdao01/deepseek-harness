/**
 * Bearer-token authentication for the /api surface, layered ON TOP of the
 * reachability fence ([api-request-trust](./api-request-trust.ts)).
 *
 * A request carrying `Authorization: Bearer <token>` that matches a configured
 * token is authenticated: the carrier lets it reach the API from any Host (a
 * server client anywhere the deployment is exposed) and additionally call the
 * pinned methods the deployment lists in `auth.unpinned`. Browser CSRF markers
 * are never bypassed by a token — a request carrying an Origin or
 * Fetch-Metadata marker always goes through the reachability fence — so the
 * same-origin SPA path is unchanged and a stolen token cannot be replayed
 * cross-site from a page. No auth configured (no tokens) reproduces today's
 * behavior exactly, and a present-but-unknown token is a client error the
 * carrier surfaces as 401 rather than silently downgrading to reachability.
 *
 * Tokens are compared in constant time (over their SHA-256 digests, so the
 * compare inputs are always equal length) and every configured token is
 * checked without an early return, so neither a token's value nor its position
 * leaks through timing. The token `name` is for logs and rotation only — it is
 * never an identity the API trusts.
 *
 * Two credential transports resolve to the same principal: an
 * `Authorization: Bearer <token>` header (full token OR ticket), and — for the
 * browser, which cannot set that header on a WebSocket handshake or a GET
 * download — the HttpOnly {@link TICKET_COOKIE_NAME} cookie. A cookie is ONLY
 * ever a per-user ticket; the full API token is never accepted from a cookie,
 * so an ambient cookie can never escalate to unscoped access. The Bearer header,
 * when present, is authoritative; the cookie is consulted only in its absence.
 * @module
 */

import type { IncomingHttpHeaders } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import {
  prepareTicketAuth, verifyTicket,
  type ApiPrincipal, type PreparedTicketAuth, type TicketAuthConfig,
} from '@deepseek-ai/dsh-user-ticket'
import { readHeader } from './api-request-trust.ts'

export type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'

/** Minimum accepted token length; docs recommend ≥32 random characters. */
export const MIN_API_TOKEN_LENGTH = 16

/**
 * Cookie the browser carries the per-user ticket in. The MTIL API sets it
 * `HttpOnly; Secure; SameSite=Strict; Path=/api` on the shared origin, so it
 * rides every same-origin `/api` request — including WebSocket handshakes and
 * GET downloads, where a header cannot be set — while staying unreadable to
 * page scripts. A cookie value is only ever verified as a ticket, never a token.
 */
export const TICKET_COOKIE_NAME = 'dsh_ticket'

/**
 * Pins an authenticated client may call by default when the deployment ships no
 * explicit `auth` and the token is derived from a mounted `webRuntime` (the
 * `dsh web` composition). The set is the agent-preset authoring plane only —
 * settings, credentials, and native-host pins stay closed. This is safe to ship
 * as a code default precisely because it applies ONLY to authenticated clients:
 * with no token the surface is unreachable, so an anonymous LAN caller gains
 * nothing from this list existing.
 */
export const DEFAULT_UNPINNED_METHODS: readonly string[] = [
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.update',
  'agentPreset.openDocument',
  'agentPreset.remove',
]

/**
 * Derive the default `auth` config from an optional `webRuntime` API token and
 * ticket secret. A present token (the mandatory web deployment) authorizes a
 * single `web` token that may additionally call {@link DEFAULT_UNPINNED_METHODS};
 * a present ticket secret additionally turns on per-user ticket auth (and, at
 * the deployment, the absent-fail-closed rule). With neither, authentication
 * stays disabled (non-web compositions are fence-only, exactly as before). An
 * explicit `auth` config always replaces this — it is only consulted when the
 * deployment configured none.
 * @param apiToken - the `webRuntime.apiToken` value, or undefined when unmounted.
 * @param ticketSecret - the `webRuntime.ticketSecret` value, or undefined when ticket auth is off.
 * @returns the derived auth config, or undefined to leave authentication off.
 */
export function deriveWebRuntimeAuth(
  apiToken: string | undefined,
  ticketSecret?: string,
): ApiAuthConfig | undefined {
  if (apiToken === undefined && ticketSecret === undefined) return undefined
  return {
    tokens: apiToken === undefined ? [] : [{ name: 'web', token: apiToken }],
    unpinned: [...DEFAULT_UNPINNED_METHODS],
    ...ticketSecret === undefined ? {} : { ticket: { secret: ticketSecret } },
  }
}

/** One configured API token. `name` is for logs/rotation only, never trusted as identity. */
export interface ApiAuthTokenConfig {
  /** Label for logs and rotation; never trusted as identity. */
  readonly name: string
  /** The bearer token value; compared in constant time against a presented credential. */
  readonly token: string
}

/** The `auth` config block: accepted tokens, the pins they may additionally call, and optional per-user tickets. */
export interface ApiAuthConfig {
  /** Accepted full-access tokens; each grants unscoped access when presented as a bearer credential. */
  readonly tokens: readonly ApiAuthTokenConfig[]
  /** Pinned methods an authenticated client may additionally call; defaults to none. */
  readonly unpinned?: readonly string[]
  /**
   * Optional per-user signed-ticket auth (see `@deepseek-ai/dsh-user-ticket`).
   * A full token still grants unscoped access; a valid ticket resolves to a
   * per-user principal the access layer filters and enforces against.
   */
  readonly ticket?: TicketAuthConfig
}

/**
 * Validated auth state: full-token digests to compare against, the unpinned pin
 * set, and the optional prepared ticket verifier. A full token grants unscoped
 * access; a ticket resolves a per-user principal.
 */
export interface PreparedApiAuth {
  readonly digests: readonly Buffer[]
  readonly unpinned: ReadonlySet<string>
  readonly ticket?: PreparedTicketAuth
}

/**
 * The classified credential a request presented. `ok` carries the resolved
 * principal (full token, or per-user ticket). `invalid` carries the reason so
 * the fence can answer an expired ticket with a distinguishable 401 the SPA
 * treats as "refresh the ticket", separate from an unknown/forged credential.
 */
export type ApiAuthInvalidReason = 'unknown-token' | 'ticket-expired' | 'ticket-invalid'

/**
 * The classified outcome of {@link authenticateApiRequest}: a resolved
 * principal (`ok`), no credential at all (`absent`), or a present-but-rejected
 * credential with its {@link ApiAuthInvalidReason} (`invalid`).
 */
export type ApiAuthResult =
  | { readonly status: 'ok'; readonly principal: ApiPrincipal }
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly reason: ApiAuthInvalidReason }

/**
 * Validate the `auth` config and prepare it for request-time checks. Fails the
 * load loudly on every malformed value: an `unpinned` entry outside the fixed
 * pinned set, a token shorter than {@link MIN_API_TOKEN_LENGTH}, or a
 * present-but-short ticket secret. With neither tokens nor a ticket secret
 * configured, authentication is disabled and this returns undefined (an
 * `unpinned` list is still validated so a typo cannot pass silently).
 * @param config - the resolved `auth` block, or undefined when none is configured.
 * @param pinnedMethods - the fixed set of loopback-pinned methods (`unpinned` ⊆ this).
 * @returns the prepared auth state, or undefined when authentication is disabled.
 * @throws Error when an `unpinned` entry is not pinned, or a token is too short.
 */
export function prepareApiAuth(
  config: ApiAuthConfig | undefined,
  pinnedMethods: ReadonlySet<string>,
): PreparedApiAuth | undefined {
  const tokens = config?.tokens ?? []
  const unpinned = config?.unpinned ?? []
  for (const method of unpinned) {
    if (!pinnedMethods.has(method)) {
      throw new Error(
        `client-connection: auth.unpinned entry ${JSON.stringify(method)} is not a pinned method`,
      )
    }
  }
  const ticket = prepareTicketAuth(config?.ticket)
  if (tokens.length === 0 && ticket === undefined) return undefined
  const digests = tokens.map(({ name, token }) => {
    if (token.length < MIN_API_TOKEN_LENGTH) {
      throw new Error(
        `client-connection: auth token ${JSON.stringify(name)} must be at least ${String(MIN_API_TOKEN_LENGTH)} characters`,
      )
    }
    return createHash('sha256').update(token).digest()
  })
  return { digests, unpinned: new Set(unpinned), ...ticket === undefined ? {} : { ticket } }
}

/** The bearer token from an `Authorization: Bearer <token>` header, or undefined. */
function bearerToken(headers: IncomingHttpHeaders | Headers): string | undefined {
  const authorization = readHeader(headers, 'authorization')
  if (authorization === undefined) return undefined
  // Case-insensitive scheme per RFC 6750; the token is the remainder after the
  // scheme and its separating space(s).
  return /^bearer\s+(\S.*)$/i.exec(authorization.trim())?.[1]
}

/** The {@link TICKET_COOKIE_NAME} value from the `Cookie` header, or undefined. */
function cookieTicket(headers: IncomingHttpHeaders | Headers): string | undefined {
  const cookie = readHeader(headers, 'cookie')
  if (cookie === undefined) return undefined
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== TICKET_COOKIE_NAME) continue
    const value = part.slice(eq + 1).trim()
    return value.length > 0 ? value : undefined
  }
  return undefined
}

/** Verify one ticket credential into an `ok` (per-user principal) or `invalid` result. */
function classifyTicket(value: string, ticket: PreparedTicketAuth): ApiAuthResult {
  const verified = verifyTicket(value, ticket)
  if (verified.ok) return { status: 'ok', principal: { kind: 'ticket', userId: verified.userId } }
  return { status: 'invalid', reason: verified.reason === 'expired' ? 'ticket-expired' : 'ticket-invalid' }
}

/**
 * Classify a request's credential into a principal. The `Authorization` header
 * is authoritative: a full token wins first (unscoped `token`), else a
 * configured ticket verifier resolves a per-user `ticket` or reports why it
 * failed, and an unknown header credential with no ticket verifier is
 * `unknown-token`. With no header, the browser's HttpOnly ticket cookie is
 * tried — verified ONLY as a ticket, never a token — so a WebSocket handshake
 * or GET download authenticates the same as a header-bearing fetch.
 * @param headers - the request headers.
 * @param auth - the prepared auth state, or undefined when authentication is disabled.
 * @returns the classified result: `ok` with a principal, `absent`, or `invalid` with a reason.
 */
export function authenticateApiRequest(
  headers: IncomingHttpHeaders | Headers,
  auth: PreparedApiAuth | undefined,
): ApiAuthResult {
  const token = bearerToken(headers)
  if (token !== undefined && auth !== undefined) {
    if (matchesConfiguredToken(token, auth.digests)) return { status: 'ok', principal: { kind: 'token' } }
    if (auth.ticket !== undefined) return classifyTicket(token, auth.ticket)
    return { status: 'invalid', reason: 'unknown-token' }
  }
  const cookie = cookieTicket(headers)
  if (cookie !== undefined && auth?.ticket !== undefined) return classifyTicket(cookie, auth.ticket)
  return { status: 'absent' }
}

/**
 * Resolve the principal for an HTTP request that already passed the reachability
 * fence. A valid full token or ticket carries its own principal. A credential-
 * less request is `token` (full) ONLY when ticket auth is disabled — today's
 * dev / standalone-SPA behavior — and `anonymous` (fail-closed, denied every
 * session-scoped and management operation) once `auth.ticket` is configured, so
 * the reachability lane stops granting access without a real credential. The
 * in-process client never reaches here; it defaults to `token` by construction.
 * @param headers - the request headers.
 * @param auth - the prepared auth state, or undefined when authentication is disabled.
 * @returns the caller principal to thread into dispatch and the stream openers.
 */
export function resolveHttpPrincipal(
  headers: IncomingHttpHeaders | Headers,
  auth: PreparedApiAuth | undefined,
): ApiPrincipal {
  const result = authenticateApiRequest(headers, auth)
  if (result.status === 'ok') return result.principal
  return auth?.ticket !== undefined ? { kind: 'anonymous' } : { kind: 'token' }
}

/**
 * The `WWW-Authenticate` challenge for a ticket failure, or undefined for a
 * non-ticket failure. An expired ticket tells the SPA to re-mint through Odoo;
 * an invalid one tells it the credential is bogus. An unknown full token
 * returns undefined so its 401 stays header-less, exactly as before tickets.
 * @param reason - the classified invalid reason, or undefined.
 * @returns the challenge header value, or undefined to omit the header.
 */
export function ticketChallenge(reason: ApiAuthInvalidReason | undefined): string | undefined {
  if (reason === 'ticket-expired') return 'Bearer error="invalid_token", error_description="ticket expired"'
  if (reason === 'ticket-invalid') return 'Bearer error="invalid_token", error_description="invalid ticket"'
  return undefined
}

/** Constant-time membership test of one token against every configured digest. */
function matchesConfiguredToken(token: string, digests: readonly Buffer[]): boolean {
  const presented = createHash('sha256').update(token).digest()
  let matched = false
  for (const digest of digests) {
    // No early return: comparing every digest keeps the check constant-time
    // across the token set so a match's position cannot leak through timing.
    if (timingSafeEqual(presented, digest)) matched = true
  }
  return matched
}

/**
 * Whether a request carries a browser initiator marker (an Origin or a
 * Fetch-Metadata `sec-fetch-site`). Such a request is subject to the full
 * reachability fence regardless of any token, so a stolen token cannot be
 * replayed cross-site from a page.
 * @param headers - the request headers.
 * @returns true when a browser marker is present.
 */
export function requestHasBrowserMarker(headers: IncomingHttpHeaders | Headers): boolean {
  return readHeader(headers, 'origin') !== undefined
    || readHeader(headers, 'sec-fetch-site') !== undefined
}
