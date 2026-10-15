import { createHmac } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { runWithRpcRequest } from '@deepseek-ai/dsh-user-ticket'
import { afterEach, describe, expect, it } from 'vitest'
import { agentOn, contribution, declare, harness, plugin } from '../../agent-preset-registry/tests/harness.ts'
import MtilPresets, { resolveConfig, type Config } from '../src/index.ts'

const SECRET = 'ticket-secret-for-tests-0123456789abcdef'
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function setup(config: Config = {}): Promise<{ ctx: Context; root: string }> {
  const root = config.root ?? await mkdtemp(join(tmpdir(), 'mtil-presets-'))
  const ctx = await harness()
  contexts.push(ctx)
  await declare(ctx, contribution('standard'))
  await ctx.plugin(MtilPresets, { ...config, root })
  return { ctx, root }
}

function wildcardHeaders(): Headers {
  const body = Buffer.from(JSON.stringify({ u: '*', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')
  const mac = createHmac('sha256', SECRET).update(`v1.${body}`).digest().toString('base64url')
  return new Headers({ cookie: `mtil-ticket=v1.${body}.${mac}` })
}

describe('stored presets over the registry', () => {
  it('copies a declared preset into a stored preset that composes Agents', async () => {
    const { ctx, root } = await setup()
    await ctx.mtilPresets.remoteExportCopy({ from: 'standard', id: 'ho-so', name: 'Hồ sơ', description: 'Kế toán' })
    expect((await ctx.mtilPresets.remoteExportList()).presets).toEqual([
      { id: 'ho-so', trust: 'user', isDefault: false, active: true, name: 'Hồ sơ', description: 'Kế toán' },
      { id: 'standard', trust: 'system', isDefault: true, active: true },
    ])
    const agent = await agentOn(ctx, 'session-1', 'ho-so')
    expect(ctx.tools.schemas(agent).map(row => row.name)).toEqual(['standard'])
    expect(await readFile(join(root, 'ho-so', 'preset.yml'), 'utf8')).toContain('name: Hồ sơ')
    await expect(ctx.mtilPresets.remoteExportCopy({ from: 'standard', id: 'standard' })).rejects.toMatchObject({ code: 'agent-preset/invalid' })
    await expect(ctx.mtilPresets.remoteExportCopy({ from: 'standard', id: 'Bad Id' })).rejects.toMatchObject({ code: 'agent-preset/invalid' })
    await expect(ctx.mtilPresets.remoteExportCopy({ from: 'missing', id: 'x' })).rejects.toMatchObject({ code: 'agent-preset/not-found' })
  })

  it('declares stored presets at startup and lists unreadable ones as broken', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mtil-presets-'))
    await mkdir(join(root, 'kept'), { recursive: true })
    await writeFile(join(root, 'kept', 'agent.cordis.yml'), `- name: '${plugin('contribute')}'\n  config:\n    tool: kept\n`)
    await writeFile(join(root, 'kept', 'preset.yml'), 'name: Kept\norder: 2\n')
    await mkdir(join(root, 'torn'), { recursive: true })
    await writeFile(join(root, 'torn', 'agent.cordis.yml'), 'not: a list\n')
    await mkdir(join(root, 'empty'), { recursive: true })
    await mkdir(join(root, 'standard'), { recursive: true })
    await writeFile(join(root, 'standard', 'agent.cordis.yml'), '[]\n')
    const { ctx } = await setup({ root })
    const presets = (await ctx.mtilPresets.remoteExportList()).presets
    expect(presets.find(row => row.id === 'kept')).toEqual({ id: 'kept', trust: 'user', isDefault: false, active: true, name: 'Kept' })
    expect(presets.find(row => row.id === 'torn')?.broken).toMatch(/top-level list/)
    expect(presets.find(row => row.id === 'empty')?.broken).toMatch(/cannot be read/)
    expect(presets.filter(row => row.id === 'standard')).toHaveLength(2)
    expect(presets.find(row => row.id === 'standard' && row.trust === 'user')?.broken).toMatch(/Duplicate/)
  })

  it('renames, deactivates, and deletes stored presets only', async () => {
    const { ctx, root } = await setup()
    await ctx.mtilPresets.remoteExportCopy({ from: 'standard', id: 'ho-so' })
    await ctx.mtilPresets.remoteExportRename({ agentPreset: 'ho-so', name: 'Mới', description: 'Mô tả' })
    await ctx.mtilPresets.remoteExportSetActive('ho-so', false)
    await ctx.mtilPresets.remoteExportSetActive('standard', false)
    await ctx.mtilPresets.remoteExportSetActive('standard', true)
    expect((await ctx.mtilPresets.remoteExportList()).presets[0]).toMatchObject({ id: 'ho-so', name: 'Mới', description: 'Mô tả', active: false })
    expect(JSON.parse(await readFile(join(root, '.mtil-roster.json'), 'utf8'))).toEqual({ disabled: ['ho-so'] })
    await expect(ctx.mtilPresets.remoteExportSetActive('missing', true)).rejects.toMatchObject({ code: 'agent-preset/not-found' })
    await expect(ctx.mtilPresets.remoteExportRename({ agentPreset: 'standard', name: 'x' })).rejects.toMatchObject({ code: 'agent-preset/invalid' })
    await expect(ctx.mtilPresets.remoteExportRename({ agentPreset: 'ho-so', name: ' ' })).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(ctx.mtilPresets.remoteExportDelete('standard')).rejects.toMatchObject({ code: 'agent-preset/invalid' })
    await ctx.mtilPresets.remoteExportDelete('ho-so')
    expect((await ctx.mtilPresets.remoteExportList()).presets.map(row => row.id)).toEqual(['standard'])
    expect(JSON.parse(await readFile(join(root, '.mtil-roster.json'), 'utf8'))).toEqual({ disabled: [] })
  })

  it('accepts raw compositions only from the management wildcard once a ticket secret is set', async () => {
    const { ctx } = await setup({ ticketSecret: SECRET })
    const content = `- name: '${plugin('contribute')}'\n  config:\n    tool: raw\n`
    const request = { agentPreset: 'raw', name: 'Raw', content }
    await expect(ctx.mtilPresets.remoteExportWriteRaw(request)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    const asWildcard = <T>(run: () => Promise<T>): Promise<T> => runWithRpcRequest({ headers: wildcardHeaders() }, run)
    await asWildcard(() => ctx.mtilPresets.remoteExportWriteRaw(request))
    expect(ctx.tools.schemas(await agentOn(ctx, 'raw-session', 'raw')).map(row => row.name)).toEqual(['raw'])
    await expect(asWildcard(() => ctx.mtilPresets.remoteExportWriteRaw({ ...request, content: 'x: 1' })))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(asWildcard(() => ctx.mtilPresets.remoteExportWriteRaw({ ...request, agentPreset: 'standard' })))
      .rejects.toMatchObject({ code: 'agent-preset/invalid' })
  })

  it('authors from the default preset and refuses unusable specs', async () => {
    const { ctx, root } = await setup()
    await ctx.mtilPresets.remoteExportAuthor({
      agentPreset: 'phong-ban', name: 'Phòng ban', description: 'Mô tả', kind: 'standalone', persona: 'Trợ lý',
    })
    expect(await readFile(join(root, 'phong-ban', 'agent.cordis.yml'), 'utf8')).toContain('prefix: Trợ lý')
    // No configured server: an Odoo connection is refused rather than written with a guessed path.
    const odooRequest = {
      agentPreset: 'odoo', name: 'Odoo', kind: 'standalone', persona: 'p',
      odoo: { url: 'https://odoo.example', db: 'db', user: 'ai', apiKey: 'key' },
    } as const
    await expect(ctx.mtilPresets.remoteExportAuthor(odooRequest)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(ctx.mtilPresets.remoteExportAuthor(odooRequest)).rejects.toThrow(/odooMcpServer/)
    expect((await ctx.mtilPresets.remoteExportList()).presets[0]).toMatchObject({ id: 'phong-ban', trust: 'user' })
    await expect(ctx.mtilPresets.remoteExportAuthor({ agentPreset: 'x', name: 'x', kind: 'router', persona: 'p' }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(ctx.mtilPresets.remoteExportAuthor({ agentPreset: 'standard', name: 'x', kind: 'standalone', persona: 'p' }))
      .rejects.toMatchObject({ code: 'agent-preset/invalid' })
  })

  it('covers optional display text, router departments, and a configured Odoo server', async () => {
    const server = join(await mkdtemp(join(tmpdir(), 'mtil-odoo-')), 'server.mjs')
    await writeFile(server, '')
    const { ctx, root } = await setup({ odooMcpServer: server, ticketSecret: '' })
    await ctx.mtilPresets.remoteExportCopy({ from: 'standard', id: 'plain' })
    await ctx.mtilPresets.remoteExportRename({ agentPreset: 'plain', name: 'Plain' })
    await ctx.mtilPresets.remoteExportDelete('plain')
    await ctx.mtilPresets.remoteExportWriteRaw({ agentPreset: 'raw', name: 'Raw', description: 'D', content: '[]' })
    await ctx.mtilPresets.remoteExportAuthor({
      agentPreset: 'router', name: 'Router', kind: 'router', persona: 'p', allowBash: true, allowWeb: false,
      subagents: [{ toolName: 'hr', persona: 'HR', allowWeb: true }],
      odoo: { url: 'https://odoo.example', db: 'db', user: 'ai', apiKey: 'key' },
    })
    const stored = await readFile(join(root, 'router', 'agent.cordis.yml'), 'utf8')
    expect(stored).toContain('tool-subagent-hr')
    expect(stored).toContain(server)
    expect((await ctx.mtilPresets.remoteExportList()).presets.map(row => [row.id, row.trust])).toEqual([
      ['raw', 'user'], ['router', 'user'], ['standard', 'system'],
    ])
    await expect(ctx.mtilPresets.remoteExportAuthor({ agentPreset: 'Bad Id', name: 'x', kind: 'standalone', persona: 'p' }))
      .rejects.toMatchObject({ code: 'agent-preset/invalid' })
  })

  it('lists the default preset tools for authoring pickers', async () => {
    const { ctx } = await setup()
    expect(await ctx.mtilPresets.remoteExportToolCatalog()).toEqual({ tools: [{ name: 'standard', description: 'fixture tool standard' }] })
  })
})

describe('resolveConfig', () => {
  it('expands the root and treats an empty ticket secret as unset', () => {
    expect(resolveConfig({ root: '/tmp/x', ticketSecret: '', odooMcpServer: '/s' }))
      .toEqual({ root: '/tmp/x', ticketSecret: undefined, odooMcpServer: '/s' })
    expect(resolveConfig({ odooMcpServer: '' }).odooMcpServer).toBeUndefined()
    expect(resolveConfig({}).root).toMatch(/\.agent-presets$/)
  })
})
