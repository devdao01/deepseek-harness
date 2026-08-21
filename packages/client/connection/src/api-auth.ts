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
 * @module
 */

import type { IncomingHttpHeaders } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readHeader } from './api-request-trust.ts'

/** Minimum accepted token length; docs recommend ≥32 random characters. */
export const MIN_API_TOKEN_LENGTH = 16

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
  'agentPreset.openDocument',
  'agentPreset.remove',
]

/**
 * Derive the default `auth` config from an optional `webRuntime` API token.
 * When a token is present (the mandatory web deployment), it authorizes a
 * single `web` token that may additionally call {@link DEFAULT_UNPINNED_METHODS};
 * with no token, authentication stays disabled (non-web compositions are
 * fence-only, exactly as before). An explicit `auth` config always replaces
 * this — it is only consulted when the deployment configured none.
 * @param apiToken - the `webRuntime.apiToken` value, or undefined when unmounted.
 * @returns the derived auth config, or undefined to leave authentication off.
 */
export function deriveWebRuntimeAuth(apiToken: string | undefined): ApiAuthConfig | undefined {
  if (apiToken === undefined) return undefined
  return { tokens: [{ name: 'web', token: apiToken }], unpinned: [...DEFAULT_UNPINNED_METHODS] }
}

/** One configured API token. `name` is for logs/rotation only, never trusted as identity. */
export interface ApiAuthTokenConfig {
  readonly name: string
  readonly token: string
}

/** The `auth` config block: accepted tokens plus the pins they may additionally call. */
export interface ApiAuthConfig {
  readonly tokens: readonly ApiAuthTokenConfig[]
  /** Pinned methods an authenticated client may additionally call; defaults to none. */
  readonly unpinned?: readonly string[]
}

/** Validated auth state: token digests to compare against, and the unpinned pin set. */
export interface PreparedApiAuth {
  readonly digests: readonly Buffer[]
  readonly unpinned: ReadonlySet<string>
}

/** Whether a request presented a valid token, none at all, or an unknown one. */
export type ApiAuthResult = 'authenticated' | 'absent' | 'invalid'

/**
 * Validate the `auth` config and prepare it for request-time checks. Fails the
 * load loudly on every malformed value: an `unpinned` entry outside the fixed
 * pinned set, or a token shorter than {@link MIN_API_TOKEN_LENGTH}. With no
 * tokens configured, authentication is disabled and this returns undefined
 * (an `unpinned` list is still validated so a typo cannot pass silently).
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
  if (tokens.length === 0) return undefined
  const digests = tokens.map(({ name, token }) => {
    if (token.length < MIN_API_TOKEN_LENGTH) {
      throw new Error(
        `client-connection: auth token ${JSON.stringify(name)} must be at least ${String(MIN_API_TOKEN_LENGTH)} characters`,
      )
    }
    return createHash('sha256').update(token).digest()
  })
  return { digests, unpinned: new Set(unpinned) }
}

/** The bearer token from an `Authorization: Bearer <token>` header, or undefined. */
function bearerToken(headers: IncomingHttpHeaders | Headers): string | undefined {
  const authorization = readHeader(headers, 'authorization')
  if (authorization === undefined) return undefined
  // Case-insensitive scheme per RFC 6750; the token is the remainder after the
  // scheme and its separating space(s).
  return /^bearer\s+(\S.*)$/i.exec(authorization.trim())?.[1]
}

/**
 * Classify a request's bearer credential against the prepared tokens.
 * @param headers - the request headers.
 * @param auth - the prepared auth state, or undefined when authentication is disabled.
 * @returns `authenticated` on a match, `invalid` on a present-but-unknown token,
 * `absent` when no token is presented or authentication is disabled.
 */
export function authenticateApiRequest(
  headers: IncomingHttpHeaders | Headers,
  auth: PreparedApiAuth | undefined,
): ApiAuthResult {
  const token = bearerToken(headers)
  if (token === undefined || auth === undefined) return 'absent'
  return matchesConfiguredToken(token, auth.digests) ? 'authenticated' : 'invalid'
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
