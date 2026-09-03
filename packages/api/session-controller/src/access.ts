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
 * The caller identity is a signed user ticket in the `mtil-ticket` cookie:
 * `v1.<base64url {"u","exp"}>.<base64url HMAC-SHA256>` over the deployment's
 * shared `ticketSecret` (the Odoo side mints it). No configured secret, no
 * cookie, a bad signature, or an expired ticket all read as the anonymous
 * caller, which sees unrestricted sessions only.
 */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { currentTicketUserId, verifyUserTicket } from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
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
 * The verified user id of the RPC currently being handled (the canonical
 * implementation lives in dsh-client-connection beside the ambient request).
 * @param secret - the deployment's shared ticket secret; undefined disables
 * identification entirely.
 * @returns the user id, or undefined for the anonymous caller.
 */
export function currentUserId(secret: string | undefined): string | undefined {
  return currentTicketUserId(secret)
}

export { verifyUserTicket }
export { USER_TICKET_COOKIE } from '@deepseek-ai/dsh-client-connection'

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

  /** Whether records can be written (a storage domain is mounted and open). */
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
   * @returns true for unrestricted sessions and for listed callers.
   */
  async visibleTo(header: SessionHeader, userId: string | undefined): Promise<boolean> {
    const allowed = await this.allowedUsers(header)
    if (allowed.length === 0) return true
    return userId !== undefined && allowed.includes(userId)
  }
}

/** Whether a stored record's bound identity names the caller's lifecycle. */
function identityMatches(stored: z.infer<typeof accessIdentity>, header: SessionHeader): boolean {
  return stored.createdAt === header.createdAt && stored.cwd === header.cwd
}
