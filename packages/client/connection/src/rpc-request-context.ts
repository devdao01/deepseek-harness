/**
 * Ambient HTTP context of the unary `/api` RPC being handled. The carrier
 * drops the Fetch `Request` before the gateway invokes a Remote method, so
 * deployment policy that depends on the caller — such as reading a signed
 * user ticket from the Cookie header — reads it from this AsyncLocalStorage
 * instead of widening every handler signature. Set only around the unary
 * RPC dispatch on the Host; absent everywhere else (tests, workers, direct
 * service calls), and absence must always read as "anonymous caller".
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** The caller-derived slice of one in-flight unary RPC request. */
export interface RpcRequestContext {
  /** Request headers as received by the Host carrier (Cookie included). */
  readonly headers: Headers
}

const storage = new AsyncLocalStorage<RpcRequestContext>()

/**
 * Run one RPC dispatch with its request context installed.
 * @param context - the caller-derived request slice.
 * @param run - the dispatch to execute under the context.
 * @returns the dispatch result.
 */
export function runWithRpcRequest<T>(context: RpcRequestContext, run: () => T): T {
  return storage.run(context, run)
}

/**
 * The request context of the unary RPC currently being handled.
 * @returns the context, or undefined outside a unary RPC dispatch.
 */
export function currentRpcRequest(): RpcRequestContext | undefined {
  return storage.getStore()
}
