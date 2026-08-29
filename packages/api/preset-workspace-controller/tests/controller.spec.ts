/**
 * The `presetWorkspace` Remote composed as a real service over a real
 * `WorkspaceRegistry` (with in-memory domain storage) and a roster double that
 * tracks presets and maps the same stable failures `ctx.agentPresets` does.
 * These lock the request/value shapes and provision/rollback behavior the
 * Odoo/MTIL wire consumes over `presetWorkspace/<method>` with a single
 * `request` arg: a copy provisions and returns the workspace, a failed provision
 * rolls the copied preset back, and a remove drops both the preset and its
 * workspace.
 */

import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteFailure, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import PresetWorkspaceController from '../src/index.ts'

const SIGNAL = new AbortController().signal
const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface StoredPreset {
  trust: 'system' | 'user'
  content: string
  name?: string
  description?: string
  broken?: string
}

function fail(code: string, message: string, details: object): TypertRemoteFailure {
  return new TypertRemoteFailure({ code, message, details })
}

/**
 * A preset roster double: tracks presets in a Map and raises the same stable
 * Remote failures `ctx.agentPresets` does. Seeds one shipped `standard` preset.
 */
class PresetRosterDouble {
  readonly presets = new Map<string, StoredPreset>([
    ['standard', { trust: 'system', content: 'name: standard\n', name: 'Standard', description: 'Default preset' }],
  ])

  defaultId = 'standard'

  remoteExportList(): Promise<{ presets: unknown[]; authorable: boolean }> {
    return Promise.resolve({
      presets: [...this.presets].map(([id, preset]) => ({
        id,
        trust: preset.trust,
        isDefault: id === this.defaultId,
        ...preset.name === undefined ? {} : { name: preset.name },
        ...preset.description === undefined ? {} : { description: preset.description },
        ...preset.broken === undefined ? {} : { broken: preset.broken },
      })),
      authorable: true,
    })
  }

  readDocument(id: string): Promise<unknown> {
    if (id.length === 0) throw fail('bad-request', 'agentPreset must be a non-empty string', {})
    const preset = this.presets.get(id)
    if (preset === undefined) {
      throw fail('agent-preset-not-found', `unknown preset "${id}"`, { agentPreset: id, available: [...this.presets.keys()] })
    }
    return Promise.resolve({
      agentPreset: id,
      trust: preset.trust,
      content: preset.content,
      ...preset.name === undefined ? {} : { name: preset.name },
      ...preset.description === undefined ? {} : { description: preset.description },
    })
  }

  remoteExportCopy(from: string, id: string, name?: string): Promise<void> {
    if (from.length === 0) throw fail('bad-request', 'from must be a non-empty string', {})
    if (id.length === 0) throw fail('bad-request', 'agentPreset must be a non-empty string', {})
    if (!PRESET_ID.test(id)) throw fail('agent-preset-invalid', `invalid preset id "${id}"`, { agentPreset: id, reason: 'invalid id' })
    const source = this.presets.get(from)
    if (source === undefined) {
      throw fail('agent-preset-not-found', `unknown preset "${from}"`, { agentPreset: from, available: [...this.presets.keys()] })
    }
    if (this.presets.has(id)) {
      throw fail('agent-preset-invalid', `preset "${id}" already exists`, { agentPreset: id, reason: 'exists' })
    }
    this.presets.set(id, { trust: 'user', content: source.content, ...name === undefined ? {} : { name } })
    return Promise.resolve()
  }

  remoteExportDelete(id: string): Promise<void> {
    if (id.length === 0) throw fail('bad-request', 'agentPreset must be a non-empty string', {})
    const preset = this.presets.get(id)
    if (preset === undefined) {
      throw fail('agent-preset-not-found', `unknown preset "${id}"`, { agentPreset: id, available: [...this.presets.keys()] })
    }
    if (preset.trust === 'system') {
      throw fail('agent-preset-read-only', `preset "${id}" ships with the deployment`, { agentPreset: id, reason: 'read-only' })
    }
    this.presets.delete(id)
    return Promise.resolve()
  }

  /** Domain remove used by the controller's rollback path. */
  remove(id: string): Promise<void> {
    this.presets.delete(id)
    return Promise.resolve()
  }
}

async function harness(options: { presetWorkspacesRoot?: string } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-pwc-')))
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  const roster = new PresetRosterDouble()
  ctx.provide('agentPresets', roster as never)
  const controller = new PresetWorkspaceController(ctx, { presetWorkspacesRoot: options.presetWorkspacesRoot ?? root })
  return { controller, ctx, roster, root }
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

describe('presetWorkspace.copy', () => {
  it('clones the preset, provisions its workspace, and returns both ids', async () => {
    const { controller, ctx, roster, root } = await harness()

    const value = await controller.copy({ from: 'standard', id: 'accounting', name: 'Accounting' }, SIGNAL)

    expect(value.agentPreset).toBe('accounting')
    expect(roster.presets.has('accounting')).toBe(true)
    const expectedPath = realpathSync(join(root, 'accounting'))
    const workspace = ctx.workspaceRegistry.get(value.workspace as never)
    expect(workspace?.path).toBe(expectedPath)
    expect(workspace?.title).toBe('Accounting')
  })

  it('rolls the copied preset back and answers directory-create-failed when provisioning fails', async () => {
    // A root that is a regular file makes the conventional mkdir fail (ENOTDIR).
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-pwc-file-')))
    const fileRoot = join(base, 'not-a-dir')
    writeFileSync(fileRoot, 'x')
    const { controller, ctx, roster } = await harness({ presetWorkspacesRoot: fileRoot })

    const outcome = await result(() => controller.copy({ from: 'standard', id: 'accounting' }, SIGNAL))

    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.error.code).toBe('directory-create-failed')
    expect(outcome.error.details).toEqual({ path: join(fileRoot, 'accounting') })
    // Rollback removed the just-copied preset, and no workspace was registered.
    expect(roster.presets.has('accounting')).toBe(false)
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })

  it('maps an unknown source preset and does not provision', async () => {
    const { controller, ctx } = await harness()
    const outcome = await result(() => controller.copy({ from: 'ghost', id: 'accounting' }, SIGNAL))
    expect(errorCode(outcome)).toBe('agent-preset-not-found')
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })

  it('maps an already-taken id and a traversing id to agent-preset-invalid', async () => {
    const { controller, ctx } = await harness()
    expect(errorCode(await result(() => controller.copy({ from: 'standard', id: 'standard' }, SIGNAL))))
      .toBe('agent-preset-invalid')
    expect(errorCode(await result(() => controller.copy({ from: 'standard', id: '../escape' }, SIGNAL))))
      .toBe('agent-preset-invalid')
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })
})

describe('presetWorkspace.remove', () => {
  it('deletes the preset and unregisters its workspace', async () => {
    const { controller, ctx, roster } = await harness()
    const copied = await controller.copy({ from: 'standard', id: 'accounting' }, SIGNAL)
    expect(ctx.workspaceRegistry.get(copied.workspace as never)).toBeDefined()

    await controller.remove({ id: 'accounting' }, SIGNAL)

    expect(roster.presets.has('accounting')).toBe(false)
    expect(ctx.workspaceRegistry.get(copied.workspace as never)).toBeUndefined()
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })

  it('refuses a shipped preset and leaves it registered', async () => {
    const { controller, roster } = await harness()
    const outcome = await result(() => controller.remove({ id: 'standard' }, SIGNAL))
    expect(errorCode(outcome)).toBe('agent-preset-read-only')
    expect(roster.presets.has('standard')).toBe(true)
  })

  it('maps an unknown preset to agent-preset-not-found', async () => {
    const { controller } = await harness()
    expect(errorCode(await result(() => controller.remove({ id: 'ghost' }, SIGNAL)))).toBe('agent-preset-not-found')
  })
})

describe('presetWorkspace.list and read', () => {
  it('lists presets with their workspace ids, marking the default and provisioned links', async () => {
    const { controller } = await harness()
    const copied = await controller.copy({ from: 'standard', id: 'accounting', name: 'Accounting' }, SIGNAL)

    const { presets } = await controller.list({}, SIGNAL)

    const standard = presets.find(preset => preset.id === 'standard')
    const accounting = presets.find(preset => preset.id === 'accounting')
    expect(standard).toMatchObject({ workspaceId: '', trust: 'system', isDefault: true, broken: false })
    expect(accounting).toMatchObject({
      workspaceId: copied.workspace,
      name: 'Accounting',
      trust: 'user',
      isDefault: false,
      broken: false,
    })
  })

  it('reads a preset composition beside its workspace id', async () => {
    const { controller } = await harness()
    const copied = await controller.copy({ from: 'standard', id: 'accounting' }, SIGNAL)

    const read = await controller.read({ id: 'accounting' }, SIGNAL)
    expect(read).toMatchObject({ agentPreset: 'accounting', workspaceId: copied.workspace, content: 'name: standard\n' })

    // A preset with no provisioned workspace reads back an empty workspace id.
    const standard = await controller.read({ id: 'standard' }, SIGNAL)
    expect(standard.workspaceId).toBe('')
  })

  it('maps an unknown and an empty read id to their wire codes', async () => {
    const { controller } = await harness()
    expect(errorCode(await result(() => controller.read({ id: 'ghost' }, SIGNAL)))).toBe('agent-preset-not-found')
    expect(errorCode(await result(() => controller.read({ id: '' }, SIGNAL)))).toBe('bad-request')
  })
})
