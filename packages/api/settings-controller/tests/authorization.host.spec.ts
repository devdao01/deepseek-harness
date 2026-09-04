/**
 * The authorization bridge turns the interactive `ctx.authorization` seam into
 * poll/respond steps a request/response UI drives: begin (detached), poll for
 * the sign-in URL and the pending prompt, respond with the pasted code, poll
 * again for the settled outcome.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService, { type AuthorizationFlow } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { AuthorizationBridge } from '../src/authorization.ts'

/** A flow mimicking pi-ai's ChatGPT OAuth: notify a URL, prompt for the code, commit. */
function chatgptLikeFlow(ctx: Context): AuthorizationFlow {
  return {
    key: 'llm-pi-ai:openai-codex' as CredentialKey,
    label: 'OpenAI (ChatGPT Plus/Pro)',
    methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
    run: async (session) => {
      session.notify({ message: 'Open this page to continue signing in.', url: 'https://auth.openai.com/authorize?x=1' })
      const code = await session.prompt({
        kind: 'text',
        message: 'Complete login in your browser, or paste the authorization code / redirect URL here:',
        placeholder: 'http://localhost:1455/auth/callback',
      })
      if (code !== 'the-code') throw new Error(`unexpected code ${code}`)
      await ctx.credentials.modifyRecord('llm-pi-ai:openai-codex' as CredentialKey,
        () => Promise.resolve({ kind: 'grant', payload: { token: 'grant-json' } }))
    },
  }
}

async function boot(): Promise<{ ctx: Context; bridge: AuthorizationBridge }> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials, {})
  await ctx.plugin(AuthorizationService)
  return { ctx, bridge: new AuthorizationBridge(ctx) }
}

/** Poll until the predicate holds or the budget runs out (the flow runs detached). */
async function pollUntil(
  bridge: AuthorizationBridge,
  attemptId: string,
  done: (state: NonNullable<ReturnType<AuthorizationBridge['poll']>>) => boolean,
): Promise<NonNullable<ReturnType<AuthorizationBridge['poll']>>> {
  for (let i = 0; i < 50; i += 1) {
    const state = bridge.poll(attemptId)
    if (state !== undefined && done(state)) return state
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('poll budget exhausted')
}

describe('AuthorizationBridge', () => {
  it('lists nothing without a mounted authorization seam', () => {
    const ctx = new Context()
    expect(new AuthorizationBridge(ctx).list()).toEqual([])
  })

  it('drives a ChatGPT-like OAuth flow to a committed grant', async () => {
    const { ctx, bridge } = await boot()
    ctx.authorization.registerFlow(chatgptLikeFlow(ctx))

    expect(bridge.list()).toEqual([{
      key: 'llm-pi-ai:openai-codex',
      label: 'OpenAI (ChatGPT Plus/Pro)',
      methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
      inFlight: false,
    }])

    const attemptId = bridge.begin('llm-pi-ai:openai-codex', 'oauth')

    // First the URL notice arrives, then the flow blocks on the paste prompt.
    const withUrl = await pollUntil(bridge, attemptId, s => s.notices.length > 0)
    expect(withUrl.notices[0]?.url).toBe('https://auth.openai.com/authorize?x=1')
    const withPrompt = await pollUntil(bridge, attemptId, s => s.prompt !== undefined)
    expect(withPrompt.prompt?.kind).toBe('text')

    // Draining is per-poll: the URL notice is not repeated.
    expect(bridge.poll(attemptId)?.notices).toEqual([])

    // Answer the prompt with the pasted code; the flow commits and settles.
    const promptId = withPrompt.prompt?.id as string
    expect(bridge.respond(attemptId, promptId, 'the-code')).toBe(true)
    const settled = await pollUntil(bridge, attemptId, s => s.settled !== undefined)
    expect(settled.settled?.status).toBe('authorized')
    expect(await ctx.credentials.readRecord('llm-pi-ai:openai-codex' as CredentialKey))
      .toEqual({ kind: 'grant', payload: { token: 'grant-json' } })
  })

  it('reports a failed outcome and rejects a stale prompt answer', async () => {
    const { ctx, bridge } = await boot()
    ctx.authorization.registerFlow(chatgptLikeFlow(ctx))
    const attemptId = bridge.begin('llm-pi-ai:openai-codex', undefined)
    const withPrompt = await pollUntil(bridge, attemptId, s => s.prompt !== undefined)

    // A wrong promptId is refused; the real one drives the flow to failure.
    expect(bridge.respond(attemptId, 'stale-id', 'x')).toBe(false)
    bridge.respond(attemptId, withPrompt.prompt?.id as string, 'wrong-code')
    const settled = await pollUntil(bridge, attemptId, s => s.settled !== undefined)
    expect(settled.settled?.status).toBe('failed')
  })

  it('cancels an in-flight attempt', async () => {
    const { ctx, bridge } = await boot()
    ctx.authorization.registerFlow(chatgptLikeFlow(ctx))
    const attemptId = bridge.begin('llm-pi-ai:openai-codex', undefined)
    await pollUntil(bridge, attemptId, s => s.prompt !== undefined)

    bridge.cancel(attemptId)
    const settled = await pollUntil(bridge, attemptId, s => s.settled !== undefined)
    expect(settled.settled?.status).toBe('cancelled')
  })

  it('answers an unknown attempt as failed so a poller stops', () => {
    const ctx = new Context()
    const bridge = new AuthorizationBridge(ctx)
    expect(bridge.poll('nope')).toBeUndefined()
    expect(bridge.respond('nope', 'p', 'a')).toBe(false)
    expect(() => { bridge.cancel('nope') }).not.toThrow()
  })
})
