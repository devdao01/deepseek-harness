/**
 * Connection request-principal resolver backed by the per-user ticket. Mounts
 * only when a shared HMAC secret is configured (the multi-tenant, Odoo-fronted
 * deployment): each admitted `/api` request's `dsh_ticket` cookie is verified,
 * and a valid ticket resolves to its `{ userId }` principal that the session ACL
 * keys on. An absent or empty secret leaves the resolver unmounted, so a
 * single-tenant deployment stays principal-less — byte-for-byte the built-in
 * behavior.
 *
 * @module @deepseek-ai/dsh-user-ticket/resolver
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionTrustRequest, RequestPrincipalResolver } from '@deepseek-ai/dsh-client-connection'
import {
  DEFAULT_TICKET_CLOCK_SKEW_SECONDS,
  DEFAULT_TICKET_MAX_TTL_SECONDS,
  prepareTicketAuth,
  verifyTicket,
} from './index.ts'

/** Default cookie the Odoo/MTIL front sets the ticket in. */
export const DEFAULT_TICKET_COOKIE_NAME = 'dsh_ticket'

/** Stable Cordis plugin name. */
export const name = 'user-ticket-resolver'

/** Resolver config: the shared secret plus the cookie name and lifetime guards. */
export interface Config {
  /** Shared HMAC secret (matches the Odoo minter). Empty/absent ⇒ resolver not mounted. */
  secret?: string
  /** Cookie carrying the ticket. Default: `dsh_ticket`. */
  cookieName?: string
  /** Reject a ticket whose remaining lifetime exceeds this, in seconds. Default: 900. */
  maxTtlSeconds?: number
  /** Clock-skew tolerance on `exp`, in seconds. Default: 30. */
  clockSkewSeconds?: number
}

/** Config schema; an unset secret keeps ticket auth off. */
export const Config: z<Config> = z.object({
  secret: z.string().default(''),
  cookieName: z.string().default(DEFAULT_TICKET_COOKIE_NAME),
  maxTtlSeconds: z.natural().min(1).default(DEFAULT_TICKET_MAX_TTL_SECONDS),
  clockSkewSeconds: z.natural().default(DEFAULT_TICKET_CLOCK_SKEW_SECONDS),
})

/** Read one header value from an admitted request (record or `Headers`). */
function headerValue(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Read one cookie value from a request's `cookie` header. */
function readCookie(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  const raw = headerValue(headers, 'cookie')
  if (raw === undefined) return undefined
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/**
 * Mount the ticket-backed request-principal resolver when a secret is configured.
 * @param ctx - Host plugin context.
 * @param config - resolved config (schema defaults applied).
 */
export function apply(ctx: Context, config: Config): void {
  const prepared = prepareTicketAuth(
    config.secret === undefined || config.secret.length === 0
      ? undefined
      : {
        secret: config.secret,
        ...config.maxTtlSeconds === undefined ? {} : { maxTtlSeconds: config.maxTtlSeconds },
        ...config.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: config.clockSkewSeconds },
      },
  )
  // No secret ⇒ ticket auth off: leave every request principal-less (single-tenant).
  if (prepared === undefined) return
  const cookieName = config.cookieName ?? DEFAULT_TICKET_COOKIE_NAME
  const resolver: RequestPrincipalResolver = {
    resolve(request) {
      const token = readCookie(request.headers, cookieName)
      if (token === undefined) return undefined
      const verified = verifyTicket(token, prepared)
      return verified.ok ? { userId: verified.userId } : undefined
    },
  }
  ctx.provide('requestPrincipalResolver', resolver)
}
