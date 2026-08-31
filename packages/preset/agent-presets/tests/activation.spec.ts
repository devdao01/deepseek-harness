/**
 * Preset activation and display rename. Deactivation lives in the
 * `agent-presets` settings namespace so it covers shipped read-only presets
 * and hot-reloads; it withholds pickers and NEW selection only — sessions
 * already composed keep their preset. Rename rewrites `preset.yml` display
 * text; the id (and every id-derived path) never changes.
 */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it } from 'vitest'
import AgentPresets, { COMPOSITION_FILE, METADATA_FILE } from '@deepseek-ai/dsh-agent-presets'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const VALID = '- id: tool-alpha\n  name: ../../plugins/contribute.js\n  config:\n    tool: alpha\n'

/** Composition with a file-backed settings provider and a writable user root. */
async function harness(): Promise<{ ctx: Context; userRoot: string }> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-preset-activation-'))
  const settingsFile = join(home, 'settings.yaml')
  await writeFile(settingsFile, '{}\n')
  const userRoot = join(home, 'user-presets')
  await mkdir(join(userRoot, 'mine'), { recursive: true })
  await writeFile(join(userRoot, 'mine', COMPOSITION_FILE), VALID)
  await writeFile(join(userRoot, 'mine', METADATA_FILE), 'name: Hồ Sơ 1\ndescription: kept\n')

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(FileSettingsProvider, { path: settingsFile, watch: false })
  await ctx.plugin(AgentPresets, {
    default: 'standard',
    roots: [
      { path: join(FIXTURES, 'system'), trust: 'system' as const },
      { path: userRoot, trust: 'user' as const },
    ],
    includeShippedRoot: false,
    includeUserRoot: false,
  })
  return { ctx, userRoot }
}

async function blankAgent(ctx: Context, id: string): Promise<Agent> {
  const handle = await ctx.agents.create({
    sessionId: SessionId(id),
    setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx),
  })
  return handle.agent
}

const rowOf = async (ctx: Context, id: string): Promise<{ active: boolean; name?: string } | undefined> =>
  (await ctx.agentPresets.remoteExportList()).presets.find(preset => preset.id === id)

describe('preset activation', () => {
  it('lists every preset active until one is deactivated', async () => {
    const { ctx } = await harness()

    const roster = await ctx.agentPresets.remoteExportList()

    expect(roster.presets.length).toBeGreaterThan(0)
    expect(roster.presets.every(preset => preset.active)).toBe(true)
  })

  it('flips the roster row and the settings document on deactivate, and back', async () => {
    const { ctx } = await harness()

    await ctx.agentPresets.remoteExportSetActive('minimal', false)
    expect((await rowOf(ctx, 'minimal'))?.active).toBe(false)
    expect(ctx.settings.describe().find(entry => String(entry.ns) === 'agent-presets')?.user)
      .toMatchObject({ disabled: ['minimal'] })

    await ctx.agentPresets.remoteExportSetActive('minimal', true)
    expect((await rowOf(ctx, 'minimal'))?.active).toBe(true)
  })

  it('covers a shipped read-only preset', async () => {
    const { ctx } = await harness()

    await ctx.agentPresets.remoteExportSetActive('standard', false)

    expect((await rowOf(ctx, 'standard'))?.active).toBe(false)
  })

  it('refuses to deactivate an unknown preset', async () => {
    const { ctx } = await harness()

    await expect(ctx.agentPresets.remoteExportSetActive('ghost', false))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-not-found' } })
  })

  it('refuses selecting a deactivated preset for a blank session', async () => {
    const { ctx } = await harness()
    const agent = await blankAgent(ctx, 'activation-select')
    await ctx.agentPresets.remoteExportSetActive('minimal', false)

    await expect(ctx.agentPresets.select(agent, 'minimal'))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-invalid' } })
  })

  it('keeps a running session composed from a preset deactivated afterwards', async () => {
    const { ctx } = await harness()
    const agent = await blankAgent(ctx, 'activation-running')

    await ctx.agentPresets.remoteExportSetActive('standard', false)

    expect(ctx.agentPresets.composedPreset(agent.ctx)).toBe('standard')
  })
})

describe('preset authoring notification', () => {
  it('emits agent-preset/authored after a copy commits', async () => {
    const { ctx } = await harness()
    const authored: string[] = []
    ctx.on('agent-preset/authored', (agentPreset) => { authored.push(agentPreset) })

    await ctx.agentPresets.copy('standard', 'ho-so-9')

    expect(authored).toEqual(['ho-so-9'])
  })
})

describe('preset rename', () => {
  it('rewrites the display name and keeps id and description', async () => {
    const { ctx, userRoot } = await harness()

    await ctx.agentPresets.remoteExportRename('mine', 'Hồ Sơ Mới')

    const row = await rowOf(ctx, 'mine')
    expect(row?.name).toBe('Hồ Sơ Mới')
    const metadata = await readFile(join(userRoot, 'mine', METADATA_FILE), 'utf8')
    expect(metadata).toContain('Hồ Sơ Mới')
    expect(metadata).toContain('kept')
  })

  it('refuses renaming a shipped preset', async () => {
    const { ctx } = await harness()

    await expect(ctx.agentPresets.remoteExportRename('standard', 'Nope'))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-read-only' } })
  })

  it('refuses an empty name and an unknown preset', async () => {
    const { ctx } = await harness()

    await expect(ctx.agentPresets.remoteExportRename('mine', '  '))
      .rejects.toBeInstanceOf(TypertRemoteFailure)
    await expect(ctx.agentPresets.remoteExportRename('ghost', 'Name'))
      .rejects.toMatchObject({ failure: { code: 'agent-preset-not-found' } })
  })
})
