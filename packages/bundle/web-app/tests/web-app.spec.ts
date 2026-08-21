/**
 * Web runtime glue behavior: dist resolution through the bundle's own hook,
 * the frontend-static child claiming the fallback seat, the web-surface
 * prompt section and bash runtime variables, and URL-line printing with the
 * runtime's bind-dependent LAN snapshot.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { prepareApiAuth } from '@deepseek-ai/dsh-client-connection'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { apply, Config, internals } from '../src/index.ts'

vi.mock('node:os', async importOriginal => ({
  ...await importOriginal<typeof import('node:os')>(),
  networkInterfaces: () => ({
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    en0: [{ family: 'IPv4', internal: false, address: '192.168.1.5' }],
  }),
}))

let dist: string | undefined

afterEach(() => {
  vi.restoreAllMocks()
  internals.resolveDistIndex = originalResolve
  internals.resolveApiToken = originalResolveApiToken
  if (dist !== undefined) rmSync(dist, { recursive: true, force: true })
  dist = undefined
})

const originalResolve = internals.resolveDistIndex
const originalResolveApiToken = internals.resolveApiToken
// A path-free stub token for the glue tests: token resolution has its own
// suite (api-token.spec.ts), and these tests assert dist/prompt/URL behavior.
const STUB_TOKEN = 'stub-token-0123456789abcdef'
const config = (overrides: Partial<ConstructorParameters<typeof Config>[0]> = {}): Config =>
  new Config({ printUrl: true, surfaceContext: true, trustedHosts: [], apiTokenFile: '/unused/api-token', ...overrides })

beforeEach(() => {
  internals.resolveApiToken = () => STUB_TOKEN
})

/** Stage a dist fixture and point the bundle's resolver at it. */
function stageDist(): string {
  dist = mkdtempSync(join(tmpdir(), 'dsh-web-app-'))
  mkdirSync(join(dist, 'dist'))
  const index = join(dist, 'dist', 'index.html')
  writeFileSync(index, '<head></head><body>shell</body>')
  internals.resolveDistIndex = () => index
  return index
}

/** A fake webServer capturing the fallback seat and index taps. */
function fakeHttpServer(host: '127.0.0.1' | '0.0.0.0' = '127.0.0.1'): { server: WebServer; seat: () => unknown } {
  let fallback: unknown
  const server = {
    host,
    port: 4567,
    registerFallback: (handler: unknown) => {
      fallback = handler
      return () => { fallback = undefined }
    },
    applyIndexTaps: (html: string) => html,
  } as unknown as WebServer
  return { server, seat: () => fallback }
}

/** A fake Loader whose settlement the test controls (the URL line waits on it). */
function provideLoader(ctx: Context, settle: () => Promise<void> = async () => {}): void {
  ctx.provide('loader', { await: settle } as never)
}

interface BashContribution {
  name: string
  variables: Record<string, { description: string }>
  resolve: () => Record<string, string>
}

describe('web-app runtime glue', () => {
  it('mounts dist serving, prompt section, bash variables, and prints the URL with the LAN snapshot', async () => {
    stageDist()
    const ctx = new Context()
    const { server, seat } = fakeHttpServer('0.0.0.0')
    ctx.provide('webServer', server)
    const contributions: BashContribution[] = []
    ctx.provide('shellEnv', {
      register: (contribution: BashContribution) => {
        contributions.push(contribution)
        return () => {}
      },
    } as never)
    provideLoader(ctx)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    apply(ctx, config({ printUrl: true, surfaceContext: true, trustedHosts: ['lab.internal'] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    // Settle the injected registrations.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(seat()).toBeDefined() // frontend-static claimed the fallback
    expect(ctx.get('webRuntime')).toEqual({
      lanAddresses: ['192.168.1.5'],
      trustedHosts: ['192.168.1.5', 'lab.internal'],
      apiToken: STUB_TOKEN,
    })
    expect(log).toHaveBeenCalledWith('dsh web: http://127.0.0.1:4567 (LAN: http://192.168.1.5:4567)')
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(entry => entry.name === 'harness:source')?.text).toContain('DeepSeek Harness implementation checkout')
    const section = assembly.sections.find(entry => entry.name === 'app:web-surface')
    expect(section?.text).toContain('http://127.0.0.1:4567')
    // The single update contract: the receiver is always on; no-refresh
    // reloads additionally need the rebuild watcher.
    expect(section?.text).toContain('pnpm run dev:web')
    const webRuntime = contributions.find(contribution => contribution.name === 'web-runtime')
    expect(webRuntime?.resolve()).toEqual({ DSH_WEB_URL: 'http://127.0.0.1:4567' })
    await ctx.fiber.dispose()
  })

  it('stays quiet with printUrl off', async () => {
    stageDist()
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer().server)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    apply(ctx, config({ printUrl: false, surfaceContext: true, trustedHosts: [] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).not.toHaveBeenCalled()
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(entry => entry.name === 'app:web-surface')?.text)
      .toContain('rebuilding the affected Web artifacts')
    await ctx.fiber.dispose()
  })

  it('skips the surface context when disabled (the one-shot layer): no prompt section, no bash variables', async () => {
    stageDist()
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer().server)
    const contributions: BashContribution[] = []
    ctx.provide('shellEnv', {
      register: (contribution: BashContribution) => {
        contributions.push(contribution)
        return () => {}
      },
    } as never)
    apply(ctx, config({ printUrl: false, surfaceContext: false, trustedHosts: [] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.some(entry => entry.name === 'app:web-surface')).toBe(false)
    expect(assembly.sections.some(entry => entry.name === 'harness:source')).toBe(false)
    expect(contributions).toEqual([])
    await ctx.fiber.dispose()
  })

  it('prints the loopback-only URL line when no LAN snapshot exists', async () => {
    stageDist()
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer().server)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    apply(ctx, config({ printUrl: true, surfaceContext: true, trustedHosts: [] }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).toHaveBeenCalledWith('dsh web: http://127.0.0.1:4567')
    await ctx.fiber.dispose()
  })

  it('defers the URL line until Loader settlement and drops it on failure or teardown', async () => {
    stageDist()
    // Settlement path: the line waits for loader.await() so supervisors can
    // RPC immediately after observing it.
    const settled = new Context()
    settled.provide('webServer', fakeHttpServer().server)
    let release: () => void
    const settlement = new Promise<void>((resolve) => { release = resolve })
    provideLoader(settled, () => settlement)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    apply(settled, config({ printUrl: true, surfaceContext: true, trustedHosts: [] }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).not.toHaveBeenCalled()
    release!()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).toHaveBeenCalledWith('dsh web: http://127.0.0.1:4567')
    await settled.fiber.dispose()

    // Failed path: Loader reports the sibling failure; the app prints no URL
    // for a process that is about to exit.
    log.mockClear()
    const failed = new Context()
    failed.provide('webServer', fakeHttpServer().server)
    provideLoader(failed, async () => { throw new Error('boot failed') })
    apply(failed, config({ printUrl: true, surfaceContext: true, trustedHosts: [] }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).not.toHaveBeenCalled()
    await failed.fiber.dispose()

    // Torn-down path: settlement resolves after the webserver is gone — no
    // line, no crash.
    log.mockClear()
    const torn = new Context()
    const child = torn.plugin((childCtx: Context) => {
      childCtx.provide('webServer', fakeHttpServer().server)
    })
    await child
    let releaseTorn: () => void
    const tornSettlement = new Promise<void>((resolve) => { releaseTorn = resolve })
    provideLoader(torn, () => tornSettlement)
    apply(torn, config({ printUrl: true, surfaceContext: true, trustedHosts: [] }))
    await child.dispose() // the webServer service goes away
    releaseTorn!()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).not.toHaveBeenCalled()
    await torn.fiber.dispose()
  })

  it('fails loud when the prompt section resolves against a portless webserver', async () => {
    stageDist()
    const ctx = new Context()
    // A webserver whose bound port is gone (torn down mid-request): the
    // section must throw, never render a URL with an undefined port.
    const { server } = fakeHttpServer()
    Object.defineProperty(server, 'port', { get: () => undefined })
    ctx.provide('webServer', server)
    apply(ctx, config({ printUrl: false, surfaceContext: true, trustedHosts: [] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    await expect(ctx.systemPrompt.assemble()).rejects.toThrow('webServer service missing')
    await ctx.fiber.dispose()
  })

  it('resolves the real built frontend dist through the package exports, failing loud unbuilt', () => {
    // The production resolver (not the test hook). A built checkout resolves
    // the frontend package's index.html; a dist-less one (the CI coverage
    // lane runs before any build) must fail with the build hint, never a
    // silent fallback.
    try {
      expect(originalResolve()).toMatch(/dist[/\\]index\.html$/)
    } catch (error) {
      expect((error as Error).message).toContain('frontend dist not built')
    }
  })

  it('defaults apiTokenFile to the harness state root when the config names none', async () => {
    stageDist()
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer().server)
    let resolvedFrom: string | undefined
    internals.resolveApiToken = (tokenFile) => { resolvedFrom = tokenFile; return STUB_TOKEN }
    // No apiTokenFile in config → the plugin defaults it in code.
    apply(ctx, new Config({ printUrl: false, surfaceContext: false, trustedHosts: [] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    expect(resolvedFrom).toMatch(/[/\\]api-token$/)
    expect((ctx.get('webRuntime') as { apiToken: string }).apiToken).toBe(STUB_TOKEN)
    await ctx.fiber.dispose()
  })

  it('defaults trustedHosts from the injected webStartup service when the config names none', async () => {
    stageDist()
    const ctx = new Context()
    ctx.provide('webServer', fakeHttpServer().server)
    ctx.provide('webStartup', { trustedHosts: ['from-startup.internal'] } as never)
    // No trustedHosts in config → inherited from webStartup (bind is loopback,
    // so lanAddresses is empty and the fence list is exactly the startup value).
    apply(ctx, new Config({ printUrl: false, surfaceContext: false, trustedHosts: [] }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    expect((ctx.get('webRuntime') as { trustedHosts: string[] }).trustedHosts).toEqual(['from-startup.internal'])
    await ctx.fiber.dispose()
  })

  it('resolves the real API token end-to-end: fresh install generates+persists (0600), a valid connection token, then reuse', () => {
    // The production resolver the web-runtime row uses (internals default, not
    // the glue stub): a fresh state dir generates, persists atomically at 0600,
    // and the token satisfies the connection plugin's own validator; a second
    // resolution reuses the persisted file. Driven directly so no cordis root
    // is created (the invariant test-host owns real bundle boots).
    const stateDir = mkdtempSync(join(tmpdir(), 'dsh-web-state-'))
    const tokenFile = join(stateDir, 'api-token')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const token = originalResolveApiToken(tokenFile)
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(readFileSync(tokenFile, 'utf8')).toBe(token)
      expect(statSync(tokenFile).mode & 0o777).toBe(0o600)
      // The generation line names the FILE, never the token value.
      const generationLine = log.mock.calls.map(call => String(call[0])).find(line => line.includes('generated one at'))
      expect(generationLine).toContain(tokenFile)
      expect(generationLine).not.toContain(token)
      // The generated token satisfies the connection plugin's own validator.
      expect(() => prepareApiAuth({ tokens: [{ name: 'web', token }], unpinned: [] }, new Set())).not.toThrow()
      // A second resolution reuses the persisted token, logging no new line.
      log.mockClear()
      expect(originalResolveApiToken(tokenFile)).toBe(token)
      expect(log.mock.calls.some(call => String(call[0]).includes('generated one at'))).toBe(false)
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})
