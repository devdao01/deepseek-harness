/**
 * Per-user signed ticket: a short-lived HMAC-SHA256 credential the harness
 * VERIFIES but never mints. In the Odoo/MTIL-fronted deployment the browser
 * obtains a ticket from the fronting service and calls the harness `/api`
 * directly carrying it — either as `Authorization: Bearer <ticket>` or as the
 * HttpOnly `dsh_ticket` cookie the browser sends on same-origin requests (the
 * transport for the WebSocket handshakes and GET downloads, where a browser
 * cannot set a header; see `dsh-client-connection`) — and re-mints through the
 * fronting service when it expires. The harness only checks the signature and
 * the expiry — refresh is the fronting service's job, there is no refresh
 * endpoint here.
 *
 * Format (compact, versioned): `v1.<b64url(payload)>.<b64url(HMAC_SHA256)>`,
 * `payload = {"u":<userId>,"exp":<unixSeconds>}`, MAC computed over the ASCII
 * string `"v1." + b64url(payload)`. The scheme carries NO algorithm field, so
 * algorithm-confusion / `alg:none` is impossible by construction: the verifier
 * only ever computes HMAC-SHA256. This is a private credential shared between
 * one Odoo minter and this verifier — no third-party JWT consumer — which is
 * why a maintained JOSE dependency would delete no owned surface and is not
 * used; {@link verifyTicket} is the single seam a future swap would replace.
 *
 * The MAC is compared in constant time over equal-length digests, mirroring
 * the bearer-token check in `dsh-client-connection`. `exp` is honored with a
 * small fixed clock-skew tolerance (Odoo and the harness may drift); a ticket
 * whose `exp` sits further in the future than the configured max TTL is
 * rejected as invalid, since the harness never mints such a ticket.
 * @module @deepseek-ai/dsh-user-ticket
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque per-user identity carried by a verified ticket; branded so it cannot be confused with other ids. */
export type UserId = Branded<'UserId'>

/**
 * Brand a raw user id string (the value Odoo puts in the ticket's `u` claim).
 * @param id - the non-empty user identifier.
 * @returns the same string carrying the user-id brand.
 */
export function UserId(id: string): UserId {
  return id as UserId
}

/**
 * The caller identity a request resolves to at the auth fence. A full bearer
 * token grants unscoped access (`token`); a verified ticket carries the
 * per-user `userId` the access layer filters and enforces against; `anonymous`
 * is a credential-less HTTP request in a ticket-configured deployment — it is
 * denied every session-scoped and management operation (fail-closed), so the
 * reachability lane no longer grants access without a real credential once
 * tickets are on.
 */
export type ApiPrincipal =
  | { readonly kind: 'token' }
  | { readonly kind: 'ticket'; readonly userId: UserId }
  | { readonly kind: 'anonymous' }

/** Minimum HMAC secret length in characters; a shorter secret fails the load loudly. */
export const MIN_TICKET_SECRET_LENGTH = 32

/**
 * Default upper bound on a ticket's remaining lifetime: a ticket whose `exp`
 * exceeds `now + this` is rejected. Odoo targets a ~10 minute mint TTL; this
 * cap is the harness's own guard against a mis-minted long-lived ticket.
 */
export const DEFAULT_TICKET_MAX_TTL_SECONDS = 900

/** Default clock-skew tolerance applied to `exp`, absorbing Odoo/harness drift. */
export const DEFAULT_TICKET_CLOCK_SKEW_SECONDS = 30

/** The `auth.ticket` config block: shared HMAC secret plus optional lifetime guards. */
export interface TicketAuthConfig {
  /** Shared HMAC-SHA256 secret; both Odoo (minter) and the harness (verifier) hold it. */
  readonly secret: string
  /** Reject a ticket whose `exp - now` exceeds this; defaults to {@link DEFAULT_TICKET_MAX_TTL_SECONDS}. */
  readonly maxTtlSeconds?: number
  /** Clock-skew leniency on `exp`; defaults to {@link DEFAULT_TICKET_CLOCK_SKEW_SECONDS}. */
  readonly clockSkewSeconds?: number
}

/** Validated ticket auth state prepared once at load for request-time checks. */
export interface PreparedTicketAuth {
  /** The secret as raw bytes for `createHmac`. */
  readonly secret: Buffer
  /** Resolved maximum accepted remaining lifetime, in seconds. */
  readonly maxTtlSeconds: number
  /** Resolved clock-skew tolerance, in seconds. */
  readonly clockSkewSeconds: number
}

/**
 * A verified user identity, or the reason verification failed. `expired`
 * distinguishes an authentic-but-stale ticket (the client should re-mint
 * through Odoo) from `invalid` (bad signature, malformed, or a lifetime beyond
 * the max-TTL guard — re-minting will not help).
 */
export type TicketVerification =
  | { readonly ok: true; readonly userId: UserId }
  | { readonly ok: false; readonly reason: 'expired' | 'invalid' }

/** Wire scheme prefix; the only version this verifier accepts. */
const TICKET_VERSION = 'v1'

/** The decoded ticket claims: user id and absolute Unix-seconds expiry. */
interface TicketPayload {
  readonly u: string
  readonly exp: number
}

/**
 * Validate an `auth.ticket` block and prepare it for request-time verification.
 * An absent block, or one whose secret is empty (the config materialized no
 * ticket), leaves ticket auth disabled and returns undefined. A present but
 * too-short secret, or a non-positive TTL / negative skew, fails the load.
 * @param config - the resolved `auth.ticket` block, or undefined when none is configured.
 * @returns the prepared ticket auth state, or undefined when ticket auth is disabled.
 * @throws Error when the secret is present-but-short or a lifetime guard is out of range.
 */
export function prepareTicketAuth(config: TicketAuthConfig | undefined): PreparedTicketAuth | undefined {
  if (config === undefined || config.secret.length === 0) return undefined
  if (config.secret.length < MIN_TICKET_SECRET_LENGTH) {
    throw new Error(
      `user-ticket: auth.ticket.secret must be at least ${String(MIN_TICKET_SECRET_LENGTH)} characters`,
    )
  }
  const maxTtlSeconds = config.maxTtlSeconds ?? DEFAULT_TICKET_MAX_TTL_SECONDS
  const clockSkewSeconds = config.clockSkewSeconds ?? DEFAULT_TICKET_CLOCK_SKEW_SECONDS
  if (!Number.isFinite(maxTtlSeconds) || maxTtlSeconds <= 0) {
    throw new Error('user-ticket: auth.ticket.maxTtlSeconds must be a positive number')
  }
  if (!Number.isFinite(clockSkewSeconds) || clockSkewSeconds < 0) {
    throw new Error('user-ticket: auth.ticket.clockSkewSeconds must be a non-negative number')
  }
  return { secret: Buffer.from(config.secret, 'utf8'), maxTtlSeconds, clockSkewSeconds }
}

/** True when a decoded value carries the ticket's required claim shape. */
function isTicketPayload(value: unknown): value is TicketPayload {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.u === 'string' && record.u.length > 0
    && typeof record.exp === 'number' && Number.isFinite(record.exp)
}

/**
 * Mint a ticket over the given secret. The canonical minter is Odoo (Python);
 * this function defines the wire format from the signing side and is the
 * fixture the verifier's tests sign with — kept beside {@link verifyTicket} so
 * the two directions of one format have a single home.
 * @param claims - the user id and absolute Unix-seconds expiry to encode.
 * @param secret - the shared HMAC secret (string or bytes).
 * @returns the encoded `v1.<payload>.<mac>` ticket.
 */
export function signTicket(claims: { userId: UserId | string; exp: number }, secret: string | Buffer): string {
  const payload: TicketPayload = { u: String(claims.userId), exp: claims.exp }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signingInput = `${TICKET_VERSION}.${body}`
  const mac = createHmac('sha256', secret).update(signingInput).digest()
  return `${signingInput}.${mac.toString('base64url')}`
}

/**
 * Verify a ticket's signature and lifetime. Order is authenticity first: a
 * failing MAC, wrong version, or malformed structure returns `invalid` before
 * any claim is trusted; then the max-TTL guard rejects a far-future `exp` as
 * `invalid`; then expiry (with skew) returns `expired`.
 * @param token - the presented bearer credential.
 * @param prepared - the validated ticket auth state.
 * @param nowSeconds - current time in Unix seconds; defaults to the wall clock (test hook).
 * @returns the verified user id, or the failure reason.
 */
export function verifyTicket(
  token: string,
  prepared: PreparedTicketAuth,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TicketVerification {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'invalid' }
  const [version, body, mac] = parts as [string, string, string]
  if (version !== TICKET_VERSION) return { ok: false, reason: 'invalid' }
  const signingInput = `${version}.${body}`
  const expected = createHmac('sha256', prepared.secret).update(signingInput).digest()
  const presented = Buffer.from(mac, 'base64url')
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return { ok: false, reason: 'invalid' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    // A valid MAC over a non-JSON body cannot occur for an honest minter; a
    // corrupt body is treated as an invalid credential rather than crashing.
    return { ok: false, reason: 'invalid' }
  }
  if (!isTicketPayload(parsed)) return { ok: false, reason: 'invalid' }
  if (parsed.exp - nowSeconds > prepared.maxTtlSeconds) return { ok: false, reason: 'invalid' }
  if (nowSeconds > parsed.exp + prepared.clockSkewSeconds) return { ok: false, reason: 'expired' }
  return { ok: true, userId: UserId(parsed.u) }
}
