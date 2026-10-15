import { existsSync } from 'node:fs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PresetWorkspaces } from '../src/mtil-preset-workspaces.ts'

interface FakeWorkspace {
  id: string
  path: string
  title: string
  attachSession: (id: string) => Promise<void>
  setTitle: (title: string) => Promise<void>
}

function fakeHost(options: {
  presets?: { defaultId: string; names: Record<string, string | undefined> } | undefined
  stored?: { id: string; cwd?: string }[]
  failCreate?: boolean
  failAttach?: boolean
}) {
  const workspaces = new Map<string, FakeWorkspace>()
  const attached: string[] = []
  const warn = vi.fn()
  const workspaceAt = (path: string, title: string): FakeWorkspace => ({
    id: `ws-${String(workspaces.size)}`,
    path,
    title,
    attachSession: (id) => {
      if (options.failAttach === true) return Promise.reject(new Error('attach refused'))
      attached.push(id)
      return Promise.resolve()
    },
    setTitle(title) { this.title = title; return Promise.resolve() },
  })
  const presets = options.presets === undefined ? undefined : {
    defaultId: options.presets.defaultId,
    list: () => Promise.resolve(Object.keys(options.presets?.names ?? {}).map(id => ({ id }))),
    readDocument: (id: string) => {
      if (!(id in (options.presets?.names ?? {}))) return Promise.reject(new Error(`Unknown agent preset: ${id}`))
      const name = options.presets?.names[id]
      return Promise.resolve({ agentPreset: id, content: '[]', ...name === undefined ? {} : { name } })
    },
  }
  const ctx = {
    get: (name: string) => name === 'agentPresets' ? presets : undefined,
    logger: { warn },
    workspaceRegistry: {
      resolveByPath: (path: string) => Promise.resolve(workspaces.get(path)),
      create: (path: string, title: string) => {
        if (options.failCreate === true) return Promise.reject(new Error('create refused'))
        const workspace = workspaceAt(path, title)
        workspaces.set(path, workspace)
        return Promise.resolve(workspace)
      },
    },
    sessionQuery: {
      listSessions: () => Promise.resolve((options.stored ?? []).map(row => ({
        header: { id: row.id, ...row.cwd === undefined ? {} : { cwd: row.cwd } },
      }))),
    },
  } as never as Context
  return { ctx, workspaces, attached, warn }
}

describe('MTIL preset workspaces', () => {
  it('directs a create without a location to its preset Workspace, titled by the preset name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mtil-preset-ws-'))
    const host = fakeHost({ presets: { defaultId: 'ho-so-1', names: { 'ho-so-1': 'Hồ sơ', bare: undefined } } })
    const workspaces = new PresetWorkspaces(host.ctx, root)
    expect(await workspaces.target({ cwd: '/elsewhere' })).toEqual({ cwd: '/elsewhere' })
    const defaulted = await workspaces.target({})
    expect(existsSync(join(root, 'ho-so-1'))).toBe(true)
    expect(defaulted).toEqual({ workspaceId: 'ws-0' })
    expect(host.workspaces.get(join(root, 'ho-so-1'))?.title).toBe('Hồ sơ')
    expect(await workspaces.target({})).toEqual({ workspaceId: 'ws-0' })
    expect(await workspaces.target({ agentPreset: 'bare' })).toEqual({ agentPreset: 'bare', workspaceId: 'ws-1' })
    expect(host.workspaces.get(join(root, 'bare'))?.title).toBe('bare')
    expect(await workspaces.target({ agentPreset: 'unknown' })).toMatchObject({ workspaceId: 'ws-2' })
    expect(host.workspaces.get(join(root, 'unknown'))?.title).toBe('unknown')
  })

  it('re-titles a lagging group and falls back to the directory when the Workspace fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mtil-preset-ws-'))
    const host = fakeHost({ presets: { defaultId: 'a', names: { a: 'New' } } })
    const workspaces = new PresetWorkspaces(host.ctx, root)
    await workspaces.target({})
    await host.workspaces.get(join(root, 'a'))?.setTitle('Old')
    await workspaces.target({})
    expect(host.workspaces.get(join(root, 'a'))?.title).toBe('New')
    const failing = fakeHost({ presets: { defaultId: 'a', names: { a: 'A' } }, failCreate: true })
    expect(await new PresetWorkspaces(failing.ctx, root).target({})).toEqual({ cwd: join(root, 'a') })
    expect(failing.warn).toHaveBeenCalledOnce()
  })

  it('leaves the request alone without a preset registry', async () => {
    const host = fakeHost({})
    const workspaces = new PresetWorkspaces(host.ctx, '/unused')
    expect(await workspaces.target({})).toEqual({})
    await workspaces.reconcile()
    expect(host.workspaces.size).toBe(0)
  })

  it('adopts existing preset directories and their stored sessions once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mtil-preset-ws-'))
    await mkdir(join(root, 'kept'))
    const stored = [{ id: 'in-kept', cwd: join(root, 'kept') }, { id: 'elsewhere', cwd: '/x' }, { id: 'no-cwd' }]
    const host = fakeHost({ presets: { defaultId: 'kept', names: { kept: 'Kept', absent: 'Absent' } }, stored })
    const workspaces = new PresetWorkspaces(host.ctx, root)
    await workspaces.reconcile()
    await workspaces.reconcile()
    expect([...host.workspaces.keys()]).toEqual([join(root, 'kept')])
    expect(host.attached).toEqual(['in-kept'])
    const failing = fakeHost({ presets: { defaultId: 'kept', names: { kept: 'Kept' } }, stored, failAttach: true })
    await new PresetWorkspaces(failing.ctx, root).reconcile()
    expect(failing.warn).toHaveBeenCalledOnce()
    const unensured = fakeHost({ presets: { defaultId: 'kept', names: { kept: 'Kept' } }, stored, failCreate: true })
    await new PresetWorkspaces(unensured.ctx, root).reconcile()
    expect(unensured.attached).toEqual([])
  })
})
