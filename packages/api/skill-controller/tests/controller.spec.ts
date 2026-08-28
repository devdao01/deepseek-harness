/**
 * The `skillAuthoring` Remote composed as a real service: `SkillAuthoringController`
 * constructed over a stub `typert` binding and a stub `workspaceRegistry` that
 * points one id at a real temp workspace directory. Each call is wrapped in the
 * generated unary result envelope (`{ ok, value }` or `{ ok: false, error }`), so
 * these lock the request/value shapes and failure codes the Odoo/MTIL wire
 * consumes over `<namespace>/<method>` with positional `args: [request]`.
 */

import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteFailure, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it } from 'vitest'
import SkillAuthoringController from '../src/index.ts'

const SIGNAL = new AbortController().signal

function harness(): { controller: SkillAuthoringController; root: string } {
  const ctx = new Context()
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-sc-ctrl-')))
  ctx.provide('workspaceRegistry', {
    get: (id: unknown) => (String(id) === 'ws-1' ? { id, path: root } : undefined),
  } as never)
  return { controller: new SkillAuthoringController(ctx), root }
}

/** Mirror the generated Remote's unary result envelope. */
async function result<T>(operation: () => Promise<T>): Promise<RemoteResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof TypertRemoteFailure
        ? error.failure
        : { code: 'internal', message: String(error), details: {} },
    }
  }
}

function errorCode(outcome: RemoteResult<unknown>): string {
  if (outcome.ok) throw new Error('expected a failure')
  return outcome.error.code
}

describe('skillAuthoring Remote (composed)', () => {
  it('write → listWorkspace → read → remove round-trips through the service', async () => {
    const { controller } = harness()
    await controller.write({ workspaceId: 'ws-1', name: 'zebra', description: 'last', content: 'z' }, SIGNAL)
    await controller.write({ workspaceId: 'ws-1', name: 'alpha', description: 'first', whenToUse: 'w', content: 'a' }, SIGNAL)

    const listed = await controller.listWorkspace({ workspaceId: 'ws-1' }, SIGNAL)
    expect(listed.skills).toEqual([
      { name: 'alpha', description: 'first', whenToUse: 'w', modelInvocable: true },
      { name: 'zebra', description: 'last', modelInvocable: true },
    ])

    expect(await controller.read({ workspaceId: 'ws-1', name: 'alpha' }, SIGNAL))
      .toEqual({ description: 'first', whenToUse: 'w', content: 'a' })
    expect(await controller.write({ workspaceId: 'ws-1', name: 'alpha', description: 'first', content: 'a' }, SIGNAL))
      .toEqual({ name: 'alpha' })
    expect(await controller.remove({ workspaceId: 'ws-1', name: 'alpha' }, SIGNAL)).toEqual({ removed: true })
    expect(await controller.remove({ workspaceId: 'ws-1', name: 'alpha' }, SIGNAL)).toEqual({ removed: false })
  })

  it('maps an unknown workspace to the workspace-not-found failure envelope', async () => {
    const { controller } = harness()
    const outcome = await result(() => controller.listWorkspace({ workspaceId: 'nope' }, SIGNAL))
    expect(outcome).toEqual({
      ok: false,
      error: { code: 'workspace-not-found', message: 'workspace "nope" not found', details: { workspaceId: 'nope' } },
    })
  })

  it('maps a missing skill and a traversing name to their wire codes', async () => {
    const { controller } = harness()
    expect(errorCode(await result(() => controller.read({ workspaceId: 'ws-1', name: 'ghost' }, SIGNAL))))
      .toBe('skill-not-found')
    expect(errorCode(await result(() => controller.read({ workspaceId: 'ws-1', name: '../evil' }, SIGNAL))))
      .toBe('skill-invalid-name')
  })
})
