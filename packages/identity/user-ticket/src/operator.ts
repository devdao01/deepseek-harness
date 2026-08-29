/**
 * Connection operator verifier backed by a stable shared secret. Mounts only
 * when a secret is configured (the Odoo-fronted deployment): the operator is the
 * server-to-server management plane, which reaches the harness over loopback or
 * the trusted proxy host (both pass the Host/Origin fence) and proves itself with
 * this secret in a request header — a credential a browser cannot set
 * cross-origin. The secret does NOT bypass the trust fence; it only replaces the
 * browser-auth step for a principal-less caller, admitting it as the operator.
 *
 * An absent or empty secret leaves the verifier unmounted, so no request is ever
 * operator-admitted — byte-for-byte the built-in behavior.
 *
 * @module @deepseek-ai/dsh-user-ticket/operator
 */

import { timingSafeEqual } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionTrustRequest, OperatorAuth } from '@deepseek-ai/dsh-client-connection'

/** Default request header the operator secret travels in. */
export const DEFAULT_OPERATOR_HEADER = 'x-dsh-operator'

/** Stable Cordis plugin name. */
export const name = 'user-ticket-operator'

/** Operator config: the shared secret plus the header it is read from. */
export interface Config {
  /** Stable shared operator secret (matches the Odoo config param). Empty/absent ⇒ verifier not mounted. */
  secret?: string
  /** Request header carrying the secret. Default: `x-dsh-operator`. */
  header?: string
}

/** Config schema; an unset secret keeps operator auth off. */
export const Config: z<Config> = z.object({
  secret: z.string().default(''),
  header: z.string().default(DEFAULT_OPERATOR_HEADER),
})

/** Read one header value from a request (record or `Headers`). */
function headerValue(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * Mount the secret-backed operator verifier when a secret is configured.
 * @param ctx - Host plugin context.
 * @param config - resolved config (schema defaults applied).
 */
export function apply(ctx: Context, config: Config): void {
  const secret = config.secret ?? ''
  // No secret ⇒ operator auth off: no request is ever operator-admitted (single-tenant).
  if (secret.length === 0) return
  const header = (config.header ?? DEFAULT_OPERATOR_HEADER).toLowerCase()
  const expected = Buffer.from(secret, 'utf8')
  const operatorAuth: OperatorAuth = {
    verify(request) {
      const presented = headerValue(request.headers, header)
      if (presented === undefined) return false
      const presentedBytes = Buffer.from(presented, 'utf8')
      // Guard length first: timingSafeEqual throws on unequal-length buffers.
      // A length mismatch is already a non-match, so refuse without comparing.
      if (presentedBytes.length !== expected.length) return false
      return timingSafeEqual(presentedBytes, expected)
    },
  }
  ctx.provide('operatorAuth', operatorAuth)
}
