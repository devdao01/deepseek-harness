/**
 * Optional server-to-server operator authentication for `/api`. The trust fence
 * and browser-auth gate answer *whether* a request may proceed; the request
 * principal answers *who* a per-user (ticket) caller is. A server-to-server
 * operator — the Odoo/MTIL management plane — is neither browser-authenticated
 * nor a ticket user: it reaches the harness over loopback or the trusted proxy
 * host (both pass the Host/Origin fence) and proves itself with a stable shared
 * secret carried in a request header a browser cannot set cross-origin.
 *
 * A deployment mounts an {@link OperatorAuth} (read through `ctx.get('operatorAuth')`)
 * to admit such a caller. The operator is admitted **principal-less**: Connection
 * never derives a principal for it, so `ctx.requestPrincipal.current()` stays
 * `undefined` and the operator-gated controllers keep treating it as the
 * operator. Absent an `operatorAuth`, no request is ever operator-admitted —
 * byte-for-byte the built-in behavior.
 *
 * @module @deepseek-ai/dsh-client-connection/operator-auth
 */

import type { ConnectionTrustRequest } from './rpc.ts'

/**
 * Optional deployment service that admits a server-to-server operator caller.
 * Consulted only for a request the resolver left principal-less, and only after
 * the trust fence admitted it, so a verifier classifies an already-fenced,
 * principal-less caller; the secret never bypasses the Host/Origin fence.
 */
export interface OperatorAuth {
  /**
   * Whether one admitted, principal-less `/api` request carries the operator secret.
   * @param request - the fenced request, carrying its headers.
   * @returns true to admit the request as the operator; false to leave it to the auth gate.
   */
  verify(request: ConnectionTrustRequest): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional deployment operator verifier read through `ctx.get('operatorAuth')`. */
    operatorAuth: OperatorAuth
  }
}
