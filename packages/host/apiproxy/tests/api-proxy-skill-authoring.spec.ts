/**
 * Skill authoring over a real Session → Agent → Storage → storage-domain →
 * Workspace composition. The three RPCs (`skill.read`/`write`/`remove`) are
 * workspace-addressed and edit `<workspace.path>/.agents/skills/<name>/SKILL.md`
 * directly. Coverage: write→read round-trip (frontmatter assemble/split),
 * remove idempotency, `workspace-not-found`, name safety (traversal), symlink
 * containment escape → `forbidden`, oversize → `skill-too-large`, and the
 * full-token-only gate through the fetch carrier (ticket/anonymous → forbidden).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
import type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import type { WorkspaceId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { toFetchHandler } from '../src/fetch/handler.ts'
import { SKILL_CONTENT_MAX_BYTES, assembleSkillFile, parseSkillFile } from '../src/skill-authoring.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`skill-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

function expectErr<T>(response: RpcResponse<T>): { code: string; details: Record<string, unknown> } {
  expect(response.result.ok).toBe(false)
  if (response.result.ok) throw new Error('unreachable')
  return response.result.error
}

/** Compose the API over real Session, Agent, Storage, Domain, and Workspace services. */
async function harness() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-apiproxy-skill-')))
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
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
  })
  return { api, ctx, root }
}

/** Register a workspace over the harness root and return its wire id + path. */
async function workspaceOver(api: Awaited<ReturnType<typeof harness>>['api'], path: string): Promise<{ workspaceId: WorkspaceId; path: string }> {
  const created = expectOk(await api.workspace.create(request({ path })))
  return { workspaceId: created.workspace.workspaceId, path: created.workspace.path }
}

describe('skill-authoring format', () => {
  it('round-trips description, whenToUse, and body through assemble/parse', () => {
    const file = assembleSkillFile({
      name: 'commit-helper',
      description: 'Writes commits: with a colon',
      whenToUse: 'when "quoting" is tricky',
      content: '# Body\n\nSteps here.\n',
    })
    expect(file.startsWith('---\n')).toBe(true)
    const parsed = parseSkillFile(file)
    expect(parsed).toEqual({
      description: 'Writes commits: with a colon',
      whenToUse: 'when "quoting" is tricky',
      content: '# Body\n\nSteps here.\n',
    })
  })

  it('omits whenToUse from the frontmatter when absent', () => {
    const file = assembleSkillFile({ name: 'plain', description: 'x', content: 'body' })
    expect(file).not.toContain('whenToUse')
    expect(parseSkillFile(file)).toEqual({ description: 'x', content: 'body' })
  })
})

describe('skill.write / skill.read', () => {
  it('writes a SKILL.md and reads its content back', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)

    const written = expectOk(await api.skills.write(request({
      workspaceId: workspace.workspaceId,
      name: 'commit-helper',
      description: 'Writes conventional commits',
      whenToUse: 'when committing',
      content: '# Commit helper\n\nDo the thing.\n',
    })))
    expect(written).toEqual({ name: 'commit-helper' })

    const file = join(workspace.path, '.agents', 'skills', 'commit-helper', 'SKILL.md')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('description: "Writes conventional commits"')

    const read = expectOk(await api.skills.read(request({ workspaceId: workspace.workspaceId, name: 'commit-helper' })))
    expect(read).toEqual({
      description: 'Writes conventional commits',
      whenToUse: 'when committing',
      content: '# Commit helper\n\nDo the thing.\n',
    })
  })

  it('overwrites an existing skill on a second write', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    await api.skills.write(request({ workspaceId: workspace.workspaceId, name: 'x', description: 'first', content: 'a' }))
    expectOk(await api.skills.write(request({ workspaceId: workspace.workspaceId, name: 'x', description: 'second', content: 'b' })))
    const read = expectOk(await api.skills.read(request({ workspaceId: workspace.workspaceId, name: 'x' })))
    expect(read).toEqual({ description: 'second', content: 'b' })
  })

  it('fails read of an absent skill with skill-not-found', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    expect(expectErr(await api.skills.read(request({ workspaceId: workspace.workspaceId, name: 'ghost' }))).code)
      .toBe('skill-not-found')
  })

  it('rejects an unknown workspace with workspace-not-found', async () => {
    const { api } = await harness()
    const err = expectErr(await api.skills.write(request({
      workspaceId: 'missing' as WorkspaceId, name: 'x', description: 'd', content: 'c',
    })))
    expect(err).toMatchObject({ code: 'workspace-not-found', details: { workspaceId: 'missing' } })
    expect(expectErr(await api.skills.read(request({ workspaceId: 'missing' as WorkspaceId, name: 'x' }))).code)
      .toBe('workspace-not-found')
    expect(expectErr(await api.skills.remove(request({ workspaceId: 'missing' as WorkspaceId, name: 'x' }))).code)
      .toBe('workspace-not-found')
  })

  it('rejects traversal and invalid names with skill-invalid-name', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    for (const name of ['../evil', '..', '.', 'a/b', 'a\\b', 'Bad Name']) {
      expect(expectErr(await api.skills.read(request({ workspaceId: workspace.workspaceId, name }))).code, name)
        .toBe('skill-invalid-name')
      expect(expectErr(await api.skills.write(request({ workspaceId: workspace.workspaceId, name, description: 'd', content: 'c' }))).code, name)
        .toBe('skill-invalid-name')
    }
  })

  it('refuses a body larger than the fixed size bound with skill-too-large', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    const tooBig = 'a'.repeat(SKILL_CONTENT_MAX_BYTES + 1)
    expect(expectErr(await api.skills.write(request({
      workspaceId: workspace.workspaceId, name: 'huge', description: 'd', content: tooBig,
    }))).code).toBe('skill-too-large')
    // Exactly at the bound is accepted.
    expectOk(await api.skills.write(request({
      workspaceId: workspace.workspaceId, name: 'huge', description: 'd', content: 'a'.repeat(SKILL_CONTENT_MAX_BYTES),
    })))
  })

  it('refuses a skill directory symlinked outside the workspace with forbidden', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-skill-outside-')))
    const skillsRoot = join(workspace.path, '.agents', 'skills')
    mkdirSync(skillsRoot, { recursive: true })
    symlinkSync(outside, join(skillsRoot, 'escape'))

    expect(expectErr(await api.skills.read(request({ workspaceId: workspace.workspaceId, name: 'escape' }))).code)
      .toBe('forbidden')
    expect(expectErr(await api.skills.write(request({
      workspaceId: workspace.workspaceId, name: 'escape', description: 'd', content: 'c',
    }))).code).toBe('forbidden')
    expect(expectErr(await api.skills.remove(request({ workspaceId: workspace.workspaceId, name: 'escape' }))).code)
      .toBe('forbidden')
    // The outside directory is untouched.
    expect(existsSync(outside)).toBe(true)
  })
})

describe('skill.remove', () => {
  it('removes a written skill and is idempotent', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    await api.skills.write(request({ workspaceId: workspace.workspaceId, name: 'gone', description: 'd', content: 'c' }))
    const dir = join(workspace.path, '.agents', 'skills', 'gone')
    expect(existsSync(dir)).toBe(true)

    expect(expectOk(await api.skills.remove(request({ workspaceId: workspace.workspaceId, name: 'gone' })))).toEqual({ removed: true })
    expect(existsSync(dir)).toBe(false)
    // Second remove is a no-op success.
    expect(expectOk(await api.skills.remove(request({ workspaceId: workspace.workspaceId, name: 'gone' })))).toEqual({ removed: false })
  })

  it('returns removed:false for a workspace that never authored skills', async () => {
    const { api, root } = await harness()
    const workspace = await workspaceOver(api, root)
    expect(expectOk(await api.skills.remove(request({ workspaceId: workspace.workspaceId, name: 'never' })))).toEqual({ removed: false })
  })
})

describe('skill authoring is full-token-only (fetch carrier)', () => {
  const TOKEN: ApiPrincipal = { kind: 'token' }
  const TICKET: ApiPrincipal = { kind: 'ticket', userId: UserId('alice') }
  const ANON: ApiPrincipal = { kind: 'anonymous' }
  const METHODS = ['skill.read', 'skill.write', 'skill.remove'] as const

  async function call(
    api: Awaited<ReturnType<typeof harness>>['api'],
    principal: ApiPrincipal,
    method: string,
    payload: unknown,
  ): Promise<{ ok: boolean; error?: { code: string } }> {
    const response = await toFetchHandler(api, principal).fetch(new Request(`http://h/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload }),
    }))
    const body = await response.json() as { result: { ok: boolean; error?: { code: string } } }
    return body.result
  }

  it('refuses every authoring method from a ticket caller, before parsing the payload', async () => {
    const { api } = await harness()
    for (const method of METHODS) {
      const result = await call(api, TICKET, method, {})
      expect(result.ok, method).toBe(false)
      expect(result.error?.code, method).toBe('forbidden')
    }
  })

  it('refuses every authoring method from an anonymous caller', async () => {
    const { api } = await harness()
    for (const method of METHODS) {
      expect((await call(api, ANON, method, {})).error?.code, method).toBe('forbidden')
    }
  })

  it('lets a full token through to the impl (workspace-not-found, not forbidden)', async () => {
    const { api } = await harness()
    for (const method of METHODS) {
      const result = await call(api, TOKEN, method, { workspaceId: 'missing', name: 'x', description: 'd', content: 'c' })
      expect(result.ok, method).toBe(false)
      expect(result.error?.code, method).toBe('workspace-not-found')
    }
  })
})
