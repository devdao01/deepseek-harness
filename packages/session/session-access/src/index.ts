/**
 * Per-session access-control list: which users may see and act on each session.
 * A capability seam — this service is the Definition and its single durable
 * Provider; the Consumer is the API proxy, which gates unary calls and filters
 * event-stream frames through {@link SessionAccessService.canRead}.
 *
 * Access is **fail-closed** for per-user (ticket) callers: a session with no
 * access record grants them nothing. A full-token caller (the Odoo/admin
 * management plane, or loopback) bypasses the list entirely. Management writes
 * (`set`) are the only way a session becomes visible to a ticket user.
 *
 * The list is durable in the storage-domain plane (its own `session_access`
 * domain), never the session log: it is host access-control metadata, not
 * model-visible content, so it does not affect `SESSION_FORMAT_VERSION`. Every
 * change lands as a `domain/changed` event, and the current set is
 * reconstructed by reloading the domain on open.
 * @module @deepseek-ai/dsh-session-access
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ApiPrincipal, UserId } from '@deepseek-ai/dsh-user-ticket'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { SESSION_ACCESS_TABLE, sessionAccessDomainSpec } from './spec.ts'
import type { SessionAccessRecord } from './spec.ts'

export { SESSION_ACCESS_TABLE, sessionAccessDomainSpec, sessionAccessRecord } from './spec.ts'
export type { SessionAccessRecord } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionAccess: SessionAccessService
  }
}

/** Stable Cordis plugin/service name. */
export const name = 'session-access'

/** Unique, order-stable copy of the ids, so the stored array carries no duplicates. */
function uniqueUserIds(userIds: readonly UserId[]): UserId[] {
  return [...new Set(userIds)]
}

/**
 * Durable per-session access list. Reads resolve from the in-memory domain
 * table (loaded at open, kept current by each write); writes persist and emit
 * `domain/changed`. The read gate {@link canRead} is the single enforcement
 * predicate every Consumer shares.
 */
export class SessionAccessService extends Service {
  static inject = ['storageDomain']

  private table?: KvTable<SessionId, SessionAccessRecord>

  /** @param ctx - the composing context carrying `storageDomain`. */
  constructor(ctx: Context) {
    super(ctx, 'sessionAccess')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(sessionAccessDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'session-access.domainClose')
    this.table = domain.table(SESSION_ACCESS_TABLE)
  }

  /** The opened access table; present after init. */
  private accessTable(): KvTable<SessionId, SessionAccessRecord> {
    /* v8 ignore next -- init always runs before any public method; guard against a future pre-init call. */
    if (this.table === undefined) throw new Error('session-access: service used before init')
    return this.table
  }

  /**
   * The set of users allowed to read and act on one session. An unknown
   * session returns an empty set (never undefined) — the fail-closed default:
   * absence denies every ticket user.
   * @param sessionId - the session to read access for.
   * @returns the current allowed-user set (a fresh copy; callers may not mutate the store).
   */
  get(sessionId: SessionId): ReadonlySet<UserId> {
    return new Set(this.accessTable().get(sessionId)?.userIds ?? [])
  }

  /**
   * Replace the allowed-user set for one session. An empty set removes the row
   * (revoking all ticket access); a non-empty set stores the deduplicated ids.
   * Persists, then emits `domain/changed`.
   * @param sessionId - the session whose access is replaced.
   * @param userIds - the complete new allowed-user set.
   */
  async set(sessionId: SessionId, userIds: readonly UserId[]): Promise<void> {
    const unique = uniqueUserIds(userIds)
    if (unique.length === 0) {
      await this.accessTable().delete(sessionId)
      return
    }
    await this.accessTable().put(sessionId, { userIds: unique })
  }

  /**
   * Whether a principal may read and act on one session. A full token always
   * may (management/admin/loopback); a ticket user may only when they are an
   * explicit member of the session's access set; an anonymous (credential-less)
   * principal never may. Absence of a record denies — this is the single
   * fail-closed gate every Consumer enforces.
   * @param principal - the resolved caller identity.
   * @param sessionId - the session being accessed.
   * @returns true when the principal may proceed.
   */
  canRead(principal: ApiPrincipal, sessionId: SessionId): boolean {
    if (principal.kind === 'token') return true
    if (principal.kind === 'anonymous') return false
    return this.get(sessionId).has(principal.userId)
  }

  /**
   * Subscribe to access changes. The listener fires with a session id after
   * every durable write to that session's access row, so an open event stream
   * can re-evaluate {@link canRead} for a live grant or revoke.
   * @param listener - called with the changed session id.
   * @returns a disposer that removes this subscription.
   */
  onChanged(listener: (sessionId: SessionId) => void): () => void {
    return this.ctx.on('domain/changed', (change) => {
      if (change.domain === sessionAccessDomainSpec.name && change.table === SESSION_ACCESS_TABLE) {
        listener(change.key as SessionId)
      }
    })
  }
}

export default SessionAccessService
