/**
 * `session/readWorkspaceFile` serves one workspace file's bytes for a browser
 * download. Unlike the native opener it RETURNS data, so the path must stay
 * inside the session's workspace and the result is size-capped.
 */
import { realpathSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { createSessionTestRemote } from './test-remote.ts'

function stubAgent(session: Session): Agent {
  return { id: session.id, session, status: 'idle' } as unknown as Agent
}

async function scaffold(): Promise<{ remote: ReturnType<typeof createSessionTestRemote>; cwd: string }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = stubAgent(session)
      const agentCtx = ctx.extend({ agent })
      ;(agent as { ctx?: Context }).ctx = agentCtx
      await options.setup?.(agentCtx)
      const unregister = ctx.agents.register(agent)
      return { agent, dispose: () => { unregister(); return Promise.resolve() } }
    },
    async resume() {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)
  const cwd = realpathSync(await mkdtemp(join(tmpdir(), 'dsh-read-ws-')))
  const remote = createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    cwd,
  })
  return { remote, cwd }
}

describe('session/readWorkspaceFile', () => {
  it('returns the bytes and base name of a file inside the workspace', async () => {
    const { remote, cwd } = await scaffold()
    const created = await remote.create({ cwd })
    if (!created.ok) throw new Error('create failed')
    await writeFile(join(cwd, 'báo-cáo.txt'), 'nội dung MTIL')

    const read = await remote.readWorkspaceFile({
      sessionId: created.value.sessionId,
      path: 'báo-cáo.txt',
    })

    if (!read.ok) throw new Error(`read failed: ${read.error.message}`)
    expect(read.value.name).toBe('báo-cáo.txt')
    expect(Buffer.from(read.value.contentBase64, 'base64').toString()).toBe('nội dung MTIL')
  })

  it('refuses a path escaping the workspace and a missing file', async () => {
    const { remote, cwd } = await scaffold()
    const created = await remote.create({ cwd })
    if (!created.ok) throw new Error('create failed')

    const escape = await remote.readWorkspaceFile({
      sessionId: created.value.sessionId,
      path: '../outside.txt',
    })
    expect(escape.ok).toBe(false)
    if (!escape.ok) expect(escape.error.message).toContain('escapes')

    const missing = await remote.readWorkspaceFile({
      sessionId: created.value.sessionId,
      path: 'khong-ton-tai.txt',
    })
    expect(missing.ok).toBe(false)
  })

  it('answers an unknown session with session-not-found', async () => {
    const { remote } = await scaffold()

    const read = await remote.readWorkspaceFile({
      sessionId: 'session-nope' as never,
      path: 'a.txt',
    })

    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error.code).toBe('session-not-found')
  })
})
