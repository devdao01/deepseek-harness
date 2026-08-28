/**
 * Per-request caller identity for `/api`. The Host/Origin fence and browser
 * authentication answer *whether* a request may proceed; they carry no *who*.
 * A multi-tenant deployment (the Odoo/MTIL front) supplies a
 * {@link RequestPrincipalResolver} that derives a principal from the request —
 * typically a signed identity cookie — and Connection runs each `/api` handler
 * inside an `AsyncLocalStorage` carrying it, so a downstream service (a session
 * access ACL) reads `ctx.requestPrincipal.current()` without threading identity
 * through every method signature. No resolver mounted means no principal: every
 * request runs with `current() === undefined`, exactly as a single-tenant
 * deployment expects.
 *
 * @module @deepseek-ai/dsh-client-connection/request-principal
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { Context, Service } from '@deepseek-ai/cordis'
import type { ConnectionTrustRequest } from './rpc.ts'

/** The caller identity a deployment resolver derives for one `/api` request. */
export interface RequestPrincipal {
  /** Opaque per-user id; the session ACL keys visibility by this exact value. */
  readonly userId: string
}

/**
 * Optional deployment service that derives a per-request principal. Runs after
 * the trust fence and browser-auth gate admit the request, so a resolver only
 * classifies an already-admitted caller; returning `undefined` leaves the
 * request principal-less (an anonymous, single-tenant caller).
 */
export interface RequestPrincipalResolver {
  /**
   * Derive the caller principal from one admitted `/api` request.
   * @param request - the admitted request, carrying its headers (incl. cookies).
   * @returns the resolved principal, or `undefined` for an anonymous caller.
   */
  resolve(request: ConnectionTrustRequest): RequestPrincipal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Connection-owned holder of the current `/api` request principal. */
    requestPrincipal: RequestPrincipalStore
    /** Optional deployment resolver read through `ctx.get('requestPrincipalResolver')`. */
    requestPrincipalResolver: RequestPrincipalResolver
  }
}

/**
 * Connection-owned `AsyncLocalStorage` carrying the principal of the `/api`
 * request on the current async execution. A single instance is provided as the
 * `requestPrincipal` service; only Connection's `/api` handler calls {@link run},
 * and any service reads {@link current}.
 */
export class RequestPrincipalStore extends Service {
  private readonly storage = new AsyncLocalStorage<RequestPrincipal | undefined>()

  /** @param ctx - the Connection plugin context. */
  constructor(ctx: Context) {
    super(ctx, 'requestPrincipal')
  }

  /** The principal of the `/api` request on this async execution, or `undefined`. */
  current(): RequestPrincipal | undefined {
    return this.storage.getStore()
  }

  /**
   * Run `operation` with `principal` established for its whole async execution.
   * @param principal - the request principal, or `undefined` for an anonymous caller.
   * @param operation - the `/api` handler whose descendants read {@link current}.
   * @returns whatever `operation` returns (awaited by the caller).
   */
  run<T>(principal: RequestPrincipal | undefined, operation: () => T): T {
    return this.storage.run(principal, operation)
  }
}
