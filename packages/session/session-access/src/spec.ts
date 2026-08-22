/**
 * The session-access domain declaration: the durable record schema and the
 * `defineDomain` spec the {@link SessionAccessService} opens. One `access`
 * table keyed by session id; the value is the set of user ids allowed to see
 * and act on that session. A session with no row grants no ticket user access
 * (fail-closed) — the row exists only for sessions explicitly shared.
 *
 * This lives in the storage-domain plane, NOT the session log: per-user access
 * is host access-control metadata, never model-visible content, so it does not
 * touch `SESSION_FORMAT_VERSION`.
 * @module @deepseek-ai/dsh-session-access/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UserId } from '@deepseek-ai/dsh-user-ticket'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** Backend unit name of the access table; must match the storage `UNIT_NAME_RE`. */
export const SESSION_ACCESS_TABLE = 'access'

/**
 * Durable shape of one session's access record: the user ids allowed to read
 * and act on it. Stored deduplicated; an empty set is represented by the row's
 * absence, not a stored empty array.
 */
export const sessionAccessRecord = z.object({
  userIds: z.array(z.string().transform(value => value as UserId)),
})

/** One stored access record, inferred from {@link sessionAccessRecord}. */
export type SessionAccessRecord = z.infer<typeof sessionAccessRecord>

/**
 * The session-access domain spec: one `access` table keyed by {@link SessionId}.
 * No global singleton — the table is the whole state. Opened by the service
 * through `ctx.storageDomain`.
 */
export const sessionAccessDomainSpec = defineDomain({
  name: 'session_access',
  version: 0,
  tables: { [SESSION_ACCESS_TABLE]: domainTable<SessionId, SessionAccessRecord>(sessionAccessRecord) },
})
