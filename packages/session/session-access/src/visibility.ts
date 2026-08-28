/**
 * The session-visibility filter that binds the request principal to the access
 * list. It provides `sessionVisibility` (consumed by
 * `dsh-api-session-controller`'s list and search): a session is visible when
 * `sessionAccess.canRead(current request-principal userId, id)` — the operator
 * (principal-less) sees all, a ticket user sees only sessions they are a member
 * of. Requires the request-principal seam (`dsh-client-connection`) and the
 * access list; mount it in the multi-tenant overlay only.
 *
 * @module @deepseek-ai/dsh-session-access/visibility
 */

import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionVisibility } from '@deepseek-ai/dsh-api-session-controller'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
// Type-only imports that activate the Context service merges read below.
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'session-access-visibility'

/** The access list and the request-principal store must both exist first. */
export const inject = ['sessionAccess', 'requestPrincipal']

/**
 * Provide the `sessionVisibility` filter backed by the request principal and the
 * access list.
 * @param ctx - Host plugin context carrying `sessionAccess` and `requestPrincipal`.
 */
export function apply(ctx: Context): void {
  const visibility: SessionVisibility = {
    canSee(sessionId: SessionId): boolean {
      const principal = ctx.requestPrincipal.current()
      const userId = principal === undefined ? undefined : UserId(principal.userId)
      return ctx.sessionAccess.canRead(userId, sessionId)
    },
  }
  ctx.provide('sessionVisibility', visibility)
}
