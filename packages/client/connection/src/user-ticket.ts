/**
 * Signed user-ticket verification for the `mtil-ticket` cookie: the caller
 * identity a deployment's identity provider (the Odoo plane) mints over a
 * shared HMAC-SHA256 secret as `v1.<base64url {"u","exp"}>.<base64url mac>`.
 * Lives beside the ambient RPC request context because both are
 * caller-identity plumbing every Host consumer (session controller, preset
 * roster) reads the same way; `u: "*"` is the management wildcard.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { currentRpcRequest } from './rpc-request-context.ts'

/** Cookie carrying the signed user ticket the MTIL SPA installs after its Odoo gate. */
export const USER_TICKET_COOKIE = 'mtil-ticket'

const BASE64URL = /^[A-Za-z0-9_-]+$/

function decodeBase64Url(value: string): Buffer | undefined {
  if (!BASE64URL.test(value)) return undefined
  return Buffer.from(value, 'base64url')
}

/**
 * Verify one signed user ticket.
 * @param ticket - `v1.<base64url payload>.<base64url mac>` as the identity provider mints it.
 * @param secret - the deployment's shared ticket secret.
 * @returns the user id the ticket names, or undefined for any invalid,
 * malformed, or expired ticket.
 */
export function verifyUserTicket(ticket: string, secret: string): string | undefined {
  const parts = ticket.split('.')
  const [version, body, encodedMac] = parts
  if (parts.length !== 3 || version !== 'v1' || body === undefined || encodedMac === undefined) {
    return undefined
  }
  const mac = decodeBase64Url(encodedMac)
  if (mac === undefined) return undefined
  const expected = createHmac('sha256', secret).update(`v1.${body}`).digest()
  if (mac.byteLength !== expected.byteLength || !timingSafeEqual(mac, expected)) return undefined
  const decoded = decodeBase64Url(body)
  if (decoded === undefined) return undefined
  let payload: unknown
  try {
    payload = JSON.parse(decoded.toString('utf8'))
  } catch {
    // A signed-but-unparsable body cannot name a user; anonymous is the safe read.
    return undefined
  }
  if (typeof payload !== 'object' || payload === null) return undefined
  const { u, exp } = payload as { u?: unknown; exp?: unknown }
  if (typeof u !== 'string' || u === '' || typeof exp !== 'number') return undefined
  if (exp <= Date.now() / 1000) return undefined
  return u
}

/** Read the exact cookie value without implementing general Cookie decoding. */
function cookieValue(headerValue: string, name: string): string | undefined {
  for (const segment of headerValue.split(';')) {
    const at = segment.indexOf('=')
    if (at === -1 || segment.slice(0, at).trim() !== name) continue
    return segment.slice(at + 1).trim()
  }
  return undefined
}

/**
 * The verified user id of the RPC currently being handled.
 * @param secret - the deployment's shared ticket secret; undefined or empty
 * disables identification entirely.
 * @returns the user id, or undefined for the anonymous caller.
 */
export function currentTicketUserId(secret: string | undefined): string | undefined {
  if (secret === undefined || secret === '') return undefined
  const cookies = currentRpcRequest()?.headers.get('cookie')
  if (cookies === null || cookies === undefined) return undefined
  const ticket = cookieValue(cookies, USER_TICKET_COOKIE)
  if (ticket === undefined) return undefined
  return verifyUserTicket(ticket, secret)
}
