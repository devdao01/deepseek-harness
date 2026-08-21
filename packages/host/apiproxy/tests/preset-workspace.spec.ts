/**
 * Preset-conventional workspaces. The pure path rules (root resolution, id
 * safety, id→directory mapping) are unit-tested for full branch coverage, and
 * the handler behavior is exercised over a real workspace registry: a copy
 * provisions and returns the conventional workspace, a failed provision rolls
 * the copied preset back, and a session that names only a preset attaches to
 * that preset's registered workspace and takes its cwd.
 */

import { mkdtempSync, realpathSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type AgentFactory } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { UnknownPresetError, PresetExistsError } from '@deepseek-ai/dsh-agent-presets'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { RpcId, type RpcRequest } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'
import {
  DEFAULT_PRESET_WORKSPACES_DIRNAME,
  isPresetWorkspaceIdSafe,
  presetWorkspacePath,
  resolvePresetWorkspacesRoot,
} from '../src/preset-workspace.ts'

let nextRpc = 0
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`pw-${String(nextRpc++)}`), payload }
}

describe('resolvePresetWorkspacesRoot', () => {
  it('defaults an absent value to <home>/workspace', () => {
    expect(resolvePresetWorkspacesRoot(undefined, '/home/u'))
      .toBe(join('/home/u', DEFAULT_PRESET_WORKSPACES_DIRNAME))
  })

  it('expands a ~/-prefixed value against the home directory', () => {
    expect(resolvePresetWorkspacesRoot('~/ws/presets', '/home/u')).toBe('/home/u/ws/presets')
  })

  it('passes an absolute value through unchanged', () => {
    expect(resolvePresetWorkspacesRoot('/srv/workspaces', '/home/u')).toBe('/srv/workspaces')
  })

  it('rejects a relative value at load', () => {
    expect(() => resolvePresetWorkspacesRoot('workspaces', '/home/u')).toThrow(/absolute path or start with/)
  })
})

describe('isPresetWorkspaceIdSafe', () => {
  it('accepts a plain single-segment id', () => {
    expect(isPresetWorkspaceIdSafe('accounting')).toBe(true)
  })

  it('rejects an empty id', () => {
    expect(isPresetWorkspaceIdSafe('')).toBe(false)
  })

  it('rejects a forward-slash separator', () => {
    expect(isPresetWorkspaceIdSafe('a/b')).toBe(false)
  })

  it('rejects a backslash separator', () => {
    expect(isPresetWorkspaceIdSafe('a\\b')).toBe(false)
  })

  it('rejects a single-dot segment', () => {
    expect(isPresetWorkspaceIdSafe('.')).toBe(false)
  })

  it('rejects a parent-dir segment', () => {
    expect(isPresetWorkspaceIdSafe('..')).toBe(false)
  })
})

describe('presetWorkspacePath', () => {
  it('joins the preset id under the root', () => {
    expect(presetWorkspacePath('/srv/ws', 'accounting')).toBe(join('/srv/ws', 'accounting'))
  })
})

/**
 * A roster double whose copy/remove track a local id set, so provisioning and
 * rollback can be observed. `failCopy`/`removed` let a test drive the roster's
 * behavior. The composition itself is out of scope here.
 */
function roster(ids: string[], removed: string[], stamped: Map<string, string>, failStamp: boolean): unknown {
  const presetOf = (id: string): Record<string, unknown> => ({
    id,
    trust: 'system',
    path: `/presets/${id}.yml`,
    ...stamped.has(id) ? { workspacePath: stamped.get(id) } : {},
  })
  return {
    defaultId: ids[0],
    list: () => Promise.resolve(ids.map(presetOf)),
    resolve: (id?: string) => {
      const wanted = id ?? ids[0] ?? ''
      if (!ids.includes(wanted)) return Promise.reject(new UnknownPresetError(wanted, ids))
      return Promise.resolve(presetOf(wanted))
    },
    setWorkspacePath: (id: string, workspacePath: string) => {
      if (failStamp) return Promise.reject(new Error('stamp failed'))
      if (!ids.includes(id)) return Promise.reject(new UnknownPresetError(id, ids))
      stamped.set(id, workspacePath)
      return Promise.resolve()
    },
    mount: (_ctx: Context, id?: string) =>
      Promise.resolve({ id: id ?? ids[0] ?? '', trust: 'system', path: `/presets/${id ?? ids[0] ?? ''}.yml` }),
    copy: (from: string, id: string) => {
      if (!ids.includes(from)) return Promise.reject(new UnknownPresetError(from, ids))
      if (ids.includes(id)) return Promise.reject(new PresetExistsError(id))
      ids.push(id)
      return Promise.resolve()
    },
    remove: (id: string) => {
      removed.push(id)
      const at = ids.indexOf(id)
      if (at !== -1) ids.splice(at, 1)
      return Promise.resolve()
    },
    standingKeyFor: (id?: string) => Promise.resolve({ agentPreset: id ?? ids[0] ?? '' }),
    authorable: true,
  }
}

function stubAgent(session: Session): Agent {
  return { id: session.id, session, status: 'idle' } as unknown as Agent
}

/** Compose the API over real Session, Agent, Storage, and Workspace services. */
async function harness(
  options: { presetWorkspacesRoot?: string; removed?: string[]; presets?: string[]; failStamp?: boolean } = {},
) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-preset-ws-')))
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  const removed = options.removed ?? []
  const stamped = new Map<string, string>()
  ctx.provide('agentPresets', roster([...options.presets ?? ['standard']], removed, stamped, options.failStamp ?? false) as never)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, createOptions) {
      const session = ctx.sessions.create(
        createOptions.sessionId,
        createOptions.meta === undefined ? {} : { meta: createOptions.meta },
      )
      const agent = stubAgent(session)
      const agentCtx = ctx.extend({ agent })
      ;(agent as { ctx?: Context }).ctx = agentCtx
      await createOptions.setup?.(agentCtx)
      const unregister = ctx.agents.register(agent)
      return { agent, dispose: () => { unregister(); return Promise.resolve() } }
    },
    async resume() { throw new Error('harness has no persisted sessions') },
  }
  ctx.agents.setFactory(factory)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd,
    presetWorkspacesRoot: options.presetWorkspacesRoot ?? cwd,
  })
  return { api, ctx, cwd, removed, stamped }
}

describe('agentPreset.copy workspace provisioning', () => {
  it('creates the conventional directory, registers it, stamps the preset, and returns the view', async () => {
    const { api, ctx, cwd, stamped } = await harness()

    const response = await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('unreachable')
    const expectedPath = realpathSync(join(cwd, 'accounting'))
    expect(response.result.value.workspace.path).toBe(expectedPath)
    expect(ctx.workspaceRegistry.list().map(w => w.path)).toContain(expectedPath)
    // The provisioned workspace's canonical path was stamped onto the preset.
    expect(stamped.get('accounting')).toBe(expectedPath)
  })

  it('adopts an already-registered conventional workspace on a re-provision', async () => {
    const { api, ctx, cwd } = await harness()
    const directory = join(cwd, 'accounting')
    await mkdir(directory)
    const existing = await ctx.workspaceRegistry.create(directory)

    const response = await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('unreachable')
    expect(response.result.value.workspace.workspaceId).toBe(existing.id)
    // No duplicate registration for the same canonical path.
    expect(ctx.workspaceRegistry.list().filter(w => w.path === existing.path)).toHaveLength(1)
  })

  it('refuses an id that could escape the workspace root without copying', async () => {
    const { api, ctx } = await harness()

    const response = await api.agentPresets.copy(request({ from: 'standard', agentPreset: '../escape' }))

    expect(response.result.ok).toBe(false)
    if (response.result.ok) throw new Error('unreachable')
    expect(response.result.error.code).toBe('agent-preset-invalid')
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })

  it('rolls the copied preset back and answers directory-create-failed when provisioning fails', async () => {
    // A root that is a regular file makes the conventional mkdir fail (ENOTDIR),
    // so provisioning fails after the preset was copied.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-preset-ws-')))
    const fileRoot = join(cwd, 'not-a-dir')
    await mkdir(cwd, { recursive: true })
    await (await import('node:fs/promises')).writeFile(fileRoot, 'x')
    const removed: string[] = []
    const { api } = await harness({ presetWorkspacesRoot: fileRoot, removed })

    const response = await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))

    expect(response.result.ok).toBe(false)
    if (response.result.ok) throw new Error('unreachable')
    expect(response.result.error.code).toBe('directory-create-failed')
    expect(response.result.error.details).toEqual({ path: join(fileRoot, 'accounting') })
    // Rollback removed the just-copied preset.
    expect(removed).toContain('accounting')
  })

  it('rolls the copied preset back when stamping the workspace path fails', async () => {
    const removed: string[] = []
    const { api } = await harness({ failStamp: true, removed })

    const response = await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))

    expect(response.result.ok).toBe(false)
    if (response.result.ok) throw new Error('unreachable')
    expect(response.result.error.code).toBe('directory-create-failed')
    expect(removed).toContain('accounting')
  })
})

describe('session.create preset-conventional default', () => {
  it('attaches to the registered conventional workspace and uses its cwd', async () => {
    const { api, ctx, cwd } = await harness()
    // Provision the conventional workspace by copying the preset first (this
    // also adds `accounting` to the roster).
    await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))
    const conventional = realpathSync(join(cwd, 'accounting'))

    const created = await api.sessions.create(request({ sessionId: SessionId('conv-1'), agentPreset: 'accounting' }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-1'))?.header.cwd).toBe(conventional)
    const workspace = ctx.workspaceRegistry.list().find(w => w.path === conventional)
    expect(workspace?.sessionIds).toContain(SessionId('conv-1'))
  })

  it('prefers the preset\'s stored workspacePath over the recomputed convention', async () => {
    const { api, ctx, cwd, stamped } = await harness({ presets: ['standard', 'accounting'] })
    // A stored path pointing at a DIFFERENT registered directory than the
    // conventional <cwd>/accounting, so preferring the stamp is observable.
    const storedDir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-preset-stored-')))
    await ctx.workspaceRegistry.create(storedDir)
    stamped.set('accounting', storedDir)
    // The conventional directory also exists and is registered.
    const conventional = join(cwd, 'accounting')
    await mkdir(conventional)
    await ctx.workspaceRegistry.create(conventional)

    const created = await api.sessions.create(request({ sessionId: SessionId('conv-stored'), agentPreset: 'accounting' }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-stored'))?.header.cwd).toBe(storedDir)
  })

  it('falls back to the default cwd when no conventional workspace is registered', async () => {
    const { api, ctx, cwd } = await harness({ presets: ['standard', 'accounting'] })

    const created = await api.sessions.create(request({ sessionId: SessionId('conv-2'), agentPreset: 'accounting' }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-2'))?.header.cwd).toBe(cwd)
    // No workspace was attached.
    expect(ctx.workspaceRegistry.list()).toHaveLength(0)
  })

  it('does not apply the conventional lookup to a create that names no preset', async () => {
    const { api, ctx, cwd } = await harness()
    // A default-preset workspace directory exists and is registered, but a
    // create without an agentPreset must not attach to it.
    const directory = join(cwd, 'standard')
    await mkdir(directory)
    await ctx.workspaceRegistry.create(directory)

    const created = await api.sessions.create(request({ sessionId: SessionId('conv-3') }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-3'))?.header.cwd).toBe(cwd)
  })

  it('lets an explicit cwd win over the conventional workspace', async () => {
    const { api, ctx, cwd } = await harness()
    await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))
    const explicit = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-preset-explicit-')))

    const created = await api.sessions.create(
      request({ sessionId: SessionId('conv-4'), agentPreset: 'accounting', cwd: explicit }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-4'))?.header.cwd).toBe(explicit)
    // The conventional workspace has no session attached; the explicit cwd won.
    const conventional = realpathSync(join(cwd, 'accounting'))
    expect(ctx.workspaceRegistry.list().find(w => w.path === conventional)?.sessionIds).toHaveLength(0)
  })

  it('lets an explicit workspaceId win over the conventional workspace', async () => {
    const { api, ctx } = await harness()
    await api.agentPresets.copy(request({ from: 'standard', agentPreset: 'accounting' }))
    const otherDir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-preset-other-')))
    const other = await ctx.workspaceRegistry.create(otherDir)

    const created = await api.sessions.create(
      request({ sessionId: SessionId('conv-5'), agentPreset: 'accounting', workspaceId: String(other.id) as never }))

    expect(created.result.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('conv-5'))?.header.cwd).toBe(otherDir)
  })
})

describe('resolvePresetWorkspacesRoot at construction', () => {
  it('uses the real home directory when no root is configured', () => {
    // Sanity: the default resolution is anchored at os.homedir(), which the
    // plugin passes at load.
    expect(resolvePresetWorkspacesRoot(undefined, homedir()))
      .toBe(join(homedir(), DEFAULT_PRESET_WORKSPACES_DIRNAME))
  })
})
