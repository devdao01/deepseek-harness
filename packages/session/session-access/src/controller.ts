/**
 * Operator Remote for granting per-session access. `ctx.remote.sessionAccess`
 * exposes the access list's set/get to the operator — the Odoo/MTIL management
 * plane — so it can share a session with ticket users; management writes are the
 * only way a session becomes visible to a ticket user (the list is fail-closed).
 *
 * Every method is operator-gated: a per-user (ticket) caller — one whose request
 * resolved a principal — is refused `forbidden`, since granting access is
 * management the operator owns, not something a ticket user may escalate. A
 * single-tenant deployment (no ticket principal) treats every admitted caller as
 * the operator.
 *
 * @module @deepseek-ai/dsh-session-access/controller
 */

import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Type-only imports that activate the Context service merges read below.
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from './index.ts'

/** Request for `sessionAccess.set`: the session and its complete new allowed-user set. */
export interface SessionAccessSetRequest {
  readonly sessionId: string
  readonly userIds: readonly string[]
}

/** Request for `sessionAccess.get`. */
export interface SessionAccessGetRequest {
  readonly sessionId: string
}

/** Value of `sessionAccess.set`/`get`: the current allowed-user set. */
export interface SessionAccessValue {
  readonly userIds: readonly string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the operator `sessionAccess` Remote namespace. */
    sessionAccessController: SessionAccessController
  }
}

/**
 * Host service backing the generated `ctx.remote.sessionAccess` namespace. Reads
 * and writes the durable per-session access list, gated to the operator.
 */
export class SessionAccessController extends TypertRemoteService {
  static inject = ['typert', 'sessionAccess', 'requestPrincipal']

  /** @param ctx - Host context carrying `sessionAccess` and `requestPrincipal`. */
  constructor(ctx: Context) {
    super(ctx, 'sessionAccessController', { namespace: 'sessionAccess' })
  }

  /**
   * Replace one session's allowed-user set. An empty set revokes all ticket
   * access. Operator-only.
   * @param request - the session and its complete new allowed-user set.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the stored allowed-user set after the write.
   * @throws TypertRemoteFailure `forbidden` for a ticket caller.
   */
  @Remote
  async set(request: SessionAccessSetRequest, signal: AbortSignal): Promise<SessionAccessValue> {
    void signal
    this.assertOperator()
    const sessionId = SessionId(request.sessionId)
    await this.ctx.sessionAccess.set(sessionId, request.userIds.map(id => UserId(id)))
    return { userIds: [...this.ctx.sessionAccess.get(sessionId)] }
  }

  /**
   * Read one session's allowed-user set. Operator-only.
   * @param request - the session to read access for.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the current allowed-user set.
   * @throws TypertRemoteFailure `forbidden` for a ticket caller.
   */
  @Remote
  get(request: SessionAccessGetRequest, signal: AbortSignal): SessionAccessValue {
    void signal
    this.assertOperator()
    return { userIds: [...this.ctx.sessionAccess.get(SessionId(request.sessionId))] }
  }

  /** Refuse a per-user (ticket) caller: access management belongs to the operator. */
  private assertOperator(): void {
    if (this.ctx.requestPrincipal.current() !== undefined) {
      throw new TypertRemoteFailure({
        code: 'forbidden',
        message: 'session access management is operator-only',
        details: {},
      })
    }
  }
}

export default SessionAccessController
