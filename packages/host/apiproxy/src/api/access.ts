/**
 * access domain contract: the per-session access-control management methods.
 * FULL-TOKEN ONLY — a per-user (ticket) caller is rejected at dispatch, since a
 * user may not edit their own access. The read side of enforcement (which
 * sessions a ticket user may see) is applied by the carrier and the event
 * streams, not exposed as a wire method here.
 *
 * `userIds` travels as plain strings on the wire (the `UserId` brand erases);
 * the host applies the brand when it reaches the access store.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Per-session access management methods plus the carrier's read predicate. */
export interface AccessApi {
  /**
   * Whether a principal may see and act on one session. A full token always
   * may; a per-user (ticket) principal may only when the access store admits
   * its user. Not a wire method — the carrier uses it to gate session-scoped
   * unary calls and to filter list results.
   */
  canRead(principal: ApiPrincipal, sessionId: SessionId): boolean

  /**
   * Replace the set of users allowed to see and act on one session. An empty
   * list revokes all per-user access. Full-token callers only.
   */
  setAccess(request: RpcRequest<{ sessionId: SessionId; userIds: string[] }>):
  Promise<RpcResponse<{ userIds: string[] }>>

  /**
   * Read the set of users allowed to see and act on one session. Full-token
   * callers only.
   */
  getAccess(request: RpcRequest<{ sessionId: SessionId }>):
  Promise<RpcResponse<{ userIds: string[] }>>
}
