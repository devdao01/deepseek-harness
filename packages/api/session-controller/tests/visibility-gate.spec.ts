/**
 * The per-session visibility gate: when a deployment mounts `sessionVisibility`,
 * every session-addressed method refuses `forbidden` for a session the caller may
 * not see — closing access by a known or guessed id that the list filter only
 * hides from discovery. Absent the filter, the gate is transparent.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SessionCancelRequest,
  SessionPageRequest,
  SessionRenameRequest,
} from '../src/types.ts'
import { createSessionTestController } from './test-remote.ts'

const SIGNAL = new AbortController().signal
const HIDDEN = SessionId('session-9')

function controllerFor(canSee: (sessionId: SessionId) => boolean): ReturnType<typeof createSessionTestController> {
  const ctx = new Context()
  ctx.provide('sessionVisibility', { canSee } as never)
  return createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: '/tmp',
  })
}

/** The Remote failure code an operation raises, or `undefined` when it does not throw one. */
async function failureCode(operation: () => unknown): Promise<string | undefined> {
  try {
    await operation()
    return undefined
  } catch (error: unknown) {
    return error instanceof TypertRemoteFailure ? error.failure.code : `unexpected: ${String(error)}`
  }
}

describe('session-controller per-session visibility gate', () => {
  it('refuses session-addressed methods for a hidden session', async () => {
    const controller = controllerFor(() => false)
    expect(await failureCode(() => controller.cancel({ sessionId: HIDDEN } as SessionCancelRequest))).toBe('forbidden')
    expect(await failureCode(() => controller.rename({ sessionId: HIDDEN, title: 'x' } as SessionRenameRequest))).toBe('forbidden')
    expect(await failureCode(() => controller.page(
      { address: { kind: 'session', sessionId: HIDDEN }, throughSeq: 0 } as SessionPageRequest,
      SIGNAL,
    ))).toBe('forbidden')
  })

  it('lets a visible session past the gate (any later failure is not forbidden)', async () => {
    const controller = controllerFor(() => true)
    expect(await failureCode(() => controller.cancel({ sessionId: SessionId('session-1') } as SessionCancelRequest)))
      .not.toBe('forbidden')
  })

  it('is transparent when no visibility filter is mounted', async () => {
    const ctx = new Context()
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
      cwd: '/tmp',
    })
    expect(await failureCode(() => controller.cancel({ sessionId: HIDDEN } as SessionCancelRequest)))
      .not.toBe('forbidden')
  })
})
