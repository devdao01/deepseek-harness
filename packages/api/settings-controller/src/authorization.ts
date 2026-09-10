/**
 * Request/response bridge over the interactive `ctx.authorization` seam.
 *
 * An authorization flow (e.g. pi-ai's ChatGPT OAuth) is a long-lived
 * conversation: it opens a URL, then blocks on `interaction.prompt(...)`
 * waiting for the human to paste an authorization code. A Remote transport
 * cannot hold that conversation in one call, so this manager runs each
 * attempt detached and exposes it as poll/respond steps a UI drives:
 *
 * - `begin` starts the flow with a bridge interaction and returns an attempt id;
 * - `poll` drains the notices emitted since the last poll and reports the
 *   pending prompt (the "paste your code" question) or the settled outcome;
 * - `respond` answers that prompt so the flow continues;
 * - `cancel` withdraws the attempt.
 *
 * State is process-local (one harness process); attempts are keyed by a
 * generated id, and a settled attempt is retained briefly so a final poll
 * still sees its outcome before it is reaped.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AuthorizationInteraction,
  AuthorizationNotice,
  AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import type {
  AuthorizationAttemptState,
  AuthorizationFlowView,
  AuthorizationPromptView,
} from './types.ts'

/** One flow entry as the bridge reports it. */
type AuthorizationFlowSummary = AuthorizationFlowView

/** A prompt awaiting the human's answer, with the flow-side resolvers. */
interface PendingPrompt {
  readonly id: string
  readonly view: AuthorizationPromptView
  readonly resolve: (answer: string) => void
  readonly reject: (error: Error) => void
}

/** One in-flight or just-settled attempt. */
interface Attempt {
  readonly key: CredentialKey
  readonly controller: AbortController
  notices: AuthorizationNotice[]
  pending: PendingPrompt | undefined
  settled?: { status: 'authorized' | 'cancelled' | 'failed'; message?: string }
  reapAt?: number
}

/** Milliseconds a settled attempt is kept so a final poll can read its outcome. */
const SETTLED_RETENTION_MS = 60_000

/**
 * Drives interactive authorization flows over a request/response transport.
 * Consumed by the settings controller's `authorization` Remote namespace.
 */
export class AuthorizationBridge {
  private readonly attempts = new Map<string, Attempt>()
  /** The latest attempt id per credential key, for takeover on re-begin. */
  private readonly byKey = new Map<string, string>()

  constructor(private readonly ctx: Context) {}

  /** One flow a surface can offer to run. */
  list(): AuthorizationFlowSummary[] {
    const authorization = this.ctx.get('authorization')
    if (authorization === undefined) return []
    return authorization.list().map(entry => ({
      key: entry.key,
      label: entry.label,
      methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
      inFlight: entry.inFlight,
    }))
  }

  /**
   * Start one attempt, detached, and return its id.
   * @param key - the credential record to authorize.
   * @param method - the flow method to run, or undefined for the flow's first.
   * @returns the attempt id later polled and responded to.
   * @throws when no authorization seam is mounted (surfaced to the caller).
   */
  begin(key: string, method: string | undefined): string {
    const authorization = this.ctx.get('authorization')
    if (authorization === undefined) {
      throw new Error('this deployment mounts no authorization seam')
    }
    this.reap()
    // One attempt per key, and the LATEST caller wins: a wizard closed
    // mid-flow leaves its attempt running on the seam, and without takeover
    // every later sign-in would settle failed with ALREADY_IN_FLIGHT.
    const previous = this.byKey.get(key)
    if (previous !== undefined) this.cancel(previous)
    authorization.cancel(key as CredentialKey)
    const attemptId = randomUUID()
    const controller = new AbortController()
    const attempt: Attempt = { key: key as CredentialKey, controller, notices: [], pending: undefined }
    this.attempts.set(attemptId, attempt)
    this.byKey.set(key, attemptId)

    const interaction: AuthorizationInteraction = {
      notify: (notice: AuthorizationNotice) => { attempt.notices.push(notice) },
      prompt: (prompt: AuthorizationPrompt) => new Promise<string>((resolve, reject) => {
        // One question at a time: a flow racing two prompts is not a shape any
        // installed flow uses, and the poll view carries a single prompt.
        attempt.pending?.reject(new AuthorizationDeclinedError('superseded by a new prompt'))
        attempt.pending = { id: randomUUID(), view: promptView(prompt), resolve, reject }
      }),
    }

    const start = async (): Promise<void> => {
      // The cancelled predecessor leaves the seam's running slot
      // asynchronously; retry briefly instead of failing the takeover.
      for (let tries = 0; ; tries += 1) {
        try {
          const outcome = await authorization.begin({
            key: key as CredentialKey,
            ...method === undefined ? {} : { method },
            interaction,
            signal: controller.signal,
          })
          this.settle(attempt, outcome.status)
          return
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          if (tries < 10 && !controller.signal.aborted && message.includes('already running')) {
            authorization.cancel(key as CredentialKey)
            await new Promise(resolve => setTimeout(resolve, 200))
            continue
          }
          this.settle(attempt, 'failed', message)
          return
        }
      }
    }
    void start()
    return attemptId
  }

  /**
   * Read one attempt's progress and drain its unseen notices.
   * @param attemptId - the id `begin` returned.
   * @returns the drained notices, the pending prompt if any, and the settled
   * outcome once the flow ended; `undefined` when the id is unknown or reaped.
   */
  poll(attemptId: string): AuthorizationAttemptState | undefined {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) return undefined
    const notices = attempt.notices
    attempt.notices = []
    return {
      notices,
      ...attempt.pending === undefined ? {} : { prompt: { id: attempt.pending.id, ...attempt.pending.view } },
      ...attempt.settled === undefined ? {} : { settled: attempt.settled },
    }
  }

  /**
   * Answer the pending prompt of one attempt (e.g. the pasted OAuth code).
   * @param attemptId - the attempt whose prompt to answer.
   * @param promptId - the prompt id from the last poll (rejects a stale answer).
   * @param answer - the human's text, or the chosen option id.
   * @returns true when the answer was delivered; false when there was no
   * matching pending prompt (unknown attempt, or a superseded prompt id).
   */
  respond(attemptId: string, promptId: string, answer: string): boolean {
    const pending = this.attempts.get(attemptId)?.pending
    if (pending === undefined || pending.id !== promptId) return false
    const attempt = this.attempts.get(attemptId)
    if (attempt !== undefined) attempt.pending = undefined
    pending.resolve(answer)
    return true
  }

  /**
   * Withdraw one attempt. Idempotent; a reaped or settled attempt is a no-op.
   * @param attemptId - the attempt to cancel.
   */
  cancel(attemptId: string): void {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) return
    attempt.controller.abort()
    attempt.pending?.reject(new AuthorizationDeclinedError('the attempt was cancelled'))
    attempt.pending = undefined
  }

  private settle(attempt: Attempt, status: 'authorized' | 'cancelled' | 'failed', message?: string): void {
    attempt.settled = { status, ...message === undefined ? {} : { message } }
    attempt.reapAt = Date.now() + SETTLED_RETENTION_MS
  }

  /** Drop settled attempts past their retention window. */
  private reap(): void {
    const now = Date.now()
    for (const [id, attempt] of this.attempts) {
      if (attempt.reapAt !== undefined && attempt.reapAt <= now) this.attempts.delete(id)
    }
  }
}

/** Project a flow prompt to its client view (secrets are still masked client-side). */
function promptView(prompt: AuthorizationPrompt): AuthorizationPromptView {
  if (prompt.kind === 'select') {
    return {
      kind: 'select',
      message: prompt.message,
      options: prompt.options.map(option => ({
        id: option.id,
        label: option.label,
        ...option.description === undefined ? {} : { description: option.description },
      })),
    }
  }
  return {
    kind: prompt.kind,
    message: prompt.message,
    ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
  }
}
