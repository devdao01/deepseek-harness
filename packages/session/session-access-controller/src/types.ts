/**
 * Wire types for the operator `sessionAccess` Remote namespace: reading and
 * replacing one session's allowed-user set. Kept free of runtime code so both the
 * Host service and the generated Remote client import them.
 *
 * @module @deepseek-ai/dsh-api-session-access-controller/types
 */

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
