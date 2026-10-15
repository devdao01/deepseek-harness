/**
 * Per-session access metadata and the caller identity it is checked against.
 *
 * A session's `allowedUsers` names the external user ids (an Odoo
 * `res.users` id as a string) that may see it in `session/list` and
 * `session/search`. The record lives in its own `session_access`
 * storage domain — never in the session header or log, so no on-disk
 * session format changes — bound to the log identity (`createdAt`, `cwd`)
 * exactly like the projection cache, so a deleted-then-recreated session id
 * does not inherit an unrelated record. An absent or empty record means the
 * session is unrestricted and every caller sees it.
 *
 * Callers are identified by `@deepseek-ai/dsh-user-ticket`; the anonymous
 * caller sees unrestricted sessions only.
 */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { currentTicketUserId } from '@deepseek-ai/dsh-user-ticket'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionPageRequest, SessionSetAccessRequest, SessionSetAccessValue } from './types.ts'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'


/** The stored-log identity a record is bound to (see session-projection-cache). */
const accessIdentity = z.object({
  createdAt: z.number().int().nonnegative(),
  cwd: z.string().optional(),
})

/** One session's stored access record; the whole record is replaced on write. */
const accessRecord = z.object({
  identity: accessIdentity,
  allowedUsers: z.array(z.string()),
})

type AccessRecord = z.infer<typeof accessRecord>

/** The session_access domain: one record per restricted session. */
export const sessionAccessDomainSpec = defineDomain({
  name: 'session_access',
  version: 1,
  layout: 'per-record',
  tables: { sessions: domainTable<SessionId, AccessRecord>(accessRecord) },
})


/**
 * Durable per-session `allowedUsers` records over the `session_access`
 * domain. Inert without a mounted `storageDomain` service: every session
 * then reads as unrestricted and writes are refused, which keeps stock
 * compositions and unit harnesses unchanged.
 */
export class SessionAccessStore {
  private table: KvTable<SessionId, AccessRecord> | undefined
  private readonly ready: Promise<void>

  constructor(ctx: Context) {
    const storage = ctx.get('storageDomain')
    if (storage === undefined) {
      this.ready = Promise.resolve()
      return
    }
    let domain: Domain<typeof sessionAccessDomainSpec> | undefined
    this.ready = storage.open(sessionAccessDomainSpec).then((opened) => {
      domain = opened
      this.table = opened.table('sessions')
    })
    ctx.effect(() => () => {
      void this.ready.then(() => domain?.close())
    }, 'sessionController.accessDomain')
  }

  /**
   * Whether records can be written (a storage domain is mounted and open).
   * @returns true once the domain's table is open, false when no storage is mounted.
   */
  async writable(): Promise<boolean> {
    await this.ready
    return this.table !== undefined
  }

  /**
   * The allowed user ids of one session.
   * @param header - the session's live or stored header (binds the identity).
   * @returns the stored list, or empty for absent, inert, or identity-mismatched records.
   */
  async allowedUsers(header: SessionHeader): Promise<readonly string[]> {
    await this.ready
    const record = this.table?.get(header.id)
    if (record === undefined) return []
    if (!identityMatches(record.identity, header)) return []
    return record.allowedUsers
  }

  /**
   * Replace one session's allowed user ids; an empty list deletes the record
   * (unrestricted is the absent state, so legacy and cleared sessions read alike).
   * @param header - the session's live or stored header (binds the identity).
   * @param allowedUsers - the complete new list.
   */
  async setAllowedUsers(header: SessionHeader, allowedUsers: readonly string[]): Promise<void> {
    await this.ready
    if (this.table === undefined) {
      throw new Error('session access is unavailable: this deployment mounts no storage domain')
    }
    if (allowedUsers.length === 0) {
      await this.table.delete(header.id)
      return
    }
    await this.table.put(header.id, {
      identity: { createdAt: header.createdAt, ...header.cwd === undefined ? {} : { cwd: header.cwd } },
      allowedUsers: [...new Set(allowedUsers)].sort(),
    })
  }

  /**
   * Whether one caller may see one session.
   * @param header - the session's live or stored header.
   * @param userId - the verified caller, or undefined for anonymous.
   * @returns see {@link mayView}.
   */
  async visibleTo(header: SessionHeader, userId: string | undefined): Promise<boolean> {
    return mayView(await this.allowedUsers(header), userId)
  }
}

/**
 * Whether one caller may see a session with the given allowed users.
 * @param allowed - the session's stored list; empty means unrestricted.
 * @param userId - the verified caller; `*` is the management wildcard, undefined is anonymous.
 * @returns true for unrestricted sessions, the wildcard, and listed callers.
 */
export function mayView(allowed: readonly string[], userId: string | undefined): boolean {
  return allowed.length === 0 || userId === '*' || (userId !== undefined && allowed.includes(userId))
}

/** Whether a stored record's bound identity names the caller's lifecycle. */
function identityMatches(stored: z.infer<typeof accessIdentity>, header: SessionHeader): boolean {
  return stored.createdAt === header.createdAt && stored.cwd === header.cwd
}

/**
 * The access rules session-addressed Remotes apply to the calling ticket
 * user. Without a configured `ticketSecret` every caller is anonymous.
 */
export class SessionAccessGate {
  /**
   * @param ctx - Host context carrying the Session store and query services.
   * @param store - the per-session access records.
   * @param ticketSecret - the deployment's shared ticket secret; empty means unset.
   */
  constructor(
    private readonly ctx: Context,
    private readonly store: SessionAccessStore,
    private readonly ticketSecret: string | undefined,
  ) {}

  /** Whether the deployment identifies callers by ticket. */
  get ticketed(): boolean {
    return this.ticketSecret !== undefined && this.ticketSecret !== ''
  }

  /**
   * The verified ticket user of the call being handled.
   * @returns the user id, `*` for the management plane, or undefined for anonymous.
   */
  viewer(): string | undefined {
    return currentTicketUserId(this.ticketSecret)
  }

  private async headerOf(sessionId: SessionId): Promise<SessionHeader | undefined> {
    return this.ctx.sessions.get(sessionId)?.header
      ?? (await this.ctx.sessionQuery.listSessions()).find(record => record.header.id === sessionId)?.header
  }

  /**
   * Refuse a session-addressed call from a caller the access record does not
   * name, with the `session/not-found` refusal an unknown id gets, so a
   * restricted id does not leak its existence. An unknown id passes so the
   * addressed method reports its own not-found.
   * @param sessionId - the addressed Session.
   * @throws {RemoteError} `session/not-found` for a Session hidden from the caller.
   */
  async assertMayRead(sessionId: SessionId): Promise<void> {
    if (await this.mayRead(sessionId)) return
    throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
  }

  /**
   * Whether the caller may read one Session.
   * @param sessionId - the addressed Session.
   * @returns false only for a known Session its access record hides from the caller.
   */
  async mayRead(sessionId: SessionId): Promise<boolean> {
    const header = await this.headerOf(sessionId)
    return header === undefined || await this.store.visibleTo(header, this.viewer())
  }

  /**
   * Make an identified caller the owner of the Session it just created. Only
   * an absent record is written, so adopting an existing Session never
   * replaces a list another caller installed; the `*` wildcard creates on
   * behalf of others and owns nothing.
   * @param sessionId - the created Session.
   */
  async claimCreated(sessionId: SessionId): Promise<void> {
    const viewer = this.viewer()
    if (viewer === undefined || viewer === '*') return
    const header = this.ctx.sessions.get(sessionId)?.header
    if (header === undefined || (await this.store.allowedUsers(header)).length > 0) return
    try {
      await this.store.setAllowedUsers(header, [viewer])
    } catch (error) {
      this.ctx.logger.warn(`session "${sessionId}" was created but its access record could not be written: ${String(error)}`)
    }
  }

  /**
   * Replace one Session's access list; with tickets configured only the `*`
   * management wildcard may write.
   * @param request - the Session and its complete new list.
   * @returns the list as stored (empty = unrestricted).
   * @throws {RemoteError} `gateway/internal` for a refused caller or failed write, `session/not-found` for an unknown Session.
   */
  async setAccess(request: SessionSetAccessRequest): Promise<SessionSetAccessValue> {
    if (this.ticketed && this.viewer() !== '*') {
      throw new RemoteError('gateway/internal', 'session access lists are administered by the management plane', {})
    }
    const header = await this.headerOf(request.sessionId)
    if (header === undefined) {
      throw new RemoteError('session/not-found', `session "${request.sessionId}" not found`, { sessionId: request.sessionId })
    }
    try {
      await this.store.setAllowedUsers(header, request.allowedUsers)
    } catch (error) {
      throw new RemoteError('gateway/internal',
        `failed to store the access list of session "${request.sessionId}": ${String(error)}`, {})
    }
    return { allowedUsers: await this.store.allowedUsers(header) }
  }
}

/**
 * The Session a history address is read through; a subagent reads via its parent.
 * @param address - the page or follow address.
 * @returns the Session whose access record applies.
 */
export function addressedSession(address: SessionPageRequest['address']): SessionId {
  return address.kind === 'session' ? address.sessionId : address.parentSessionId
}
