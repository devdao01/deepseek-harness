/**
 * API-token resolution for the mandatory web-deployment auth: the env override
 * (validated, never persisted), reuse of a persisted file, generation +
 * atomic 0600 persistence on a fresh install, and fail-loud on a malformed or
 * unreadable persisted file.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  API_TOKEN_FILE_SEGMENT,
  createWebApiTokenIo,
  MIN_WEB_API_TOKEN_LENGTH,
  resolveWebApiToken,
  type WebApiTokenIo,
} from '../src/api-token.ts'

const GOOD = 'a'.repeat(MIN_WEB_API_TOKEN_LENGTH)

/** A fully controllable IO double recording writes, generations, and logs. */
function fakeIo(overrides: Partial<WebApiTokenIo> = {}): WebApiTokenIo & {
  written: string[]
  logged: string[]
} {
  const written: string[] = []
  const logged: string[] = []
  return {
    envToken: undefined,
    tokenFile: '/state/api-token',
    readTokenFile: () => undefined,
    writeTokenFile: token => void written.push(token),
    generateToken: () => 'g'.repeat(64),
    logGenerated: path => void logged.push(path),
    written,
    logged,
    ...overrides,
  }
}

describe('resolveWebApiToken', () => {
  it('uses the env override without persisting it', () => {
    const io = fakeIo({ envToken: GOOD, generateToken: () => { throw new Error('must not generate') } })
    expect(resolveWebApiToken(io)).toEqual({ token: GOOD, source: 'env' })
    expect(io.written).toEqual([])
  })

  it('fails loud when the env override is too short', () => {
    const io = fakeIo({ envToken: 'x'.repeat(MIN_WEB_API_TOKEN_LENGTH - 1) })
    expect(() => resolveWebApiToken(io)).toThrow(/DSH_API_TOKEN must be at least 16 characters/)
  })

  it('reuses a valid persisted token without generating', () => {
    const io = fakeIo({ readTokenFile: () => GOOD, generateToken: () => { throw new Error('must not generate') } })
    expect(resolveWebApiToken(io)).toEqual({ token: GOOD, source: 'file' })
    expect(io.written).toEqual([])
  })

  it('fails loud on a malformed persisted file rather than overwriting it', () => {
    const io = fakeIo({ tokenFile: '/state/api-token', readTokenFile: () => 'short' })
    expect(() => resolveWebApiToken(io)).toThrow(/persisted API token at \/state\/api-token is malformed/)
    expect(io.written).toEqual([])
  })

  it('propagates a read error (never silently regenerates over an unreadable file)', () => {
    const io = fakeIo({ readTokenFile: () => { throw new Error('EACCES') } })
    expect(() => resolveWebApiToken(io)).toThrow('EACCES')
  })

  it('generates, persists, and logs on a fresh install', () => {
    const io = fakeIo()
    const resolved = resolveWebApiToken(io)
    expect(resolved).toEqual({ token: 'g'.repeat(64), source: 'generated' })
    expect(io.written).toEqual(['g'.repeat(64)])
    expect(io.logged).toEqual(['/state/api-token'])
  })
})

describe('createWebApiTokenIo (real filesystem)', () => {
  let dir: string
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }) })

  function stateDir(): string {
    dir = mkdtempSync(join(tmpdir(), 'dsh-token-io-'))
    return dir
  }

  it('reads DSH_API_TOKEN from the provided environment', () => {
    const io = createWebApiTokenIo(join(stateDir(), API_TOKEN_FILE_SEGMENT), { DSH_API_TOKEN: GOOD })
    expect(io.envToken).toBe(GOOD)
  })

  it('reads an absent token file as undefined', () => {
    const io = createWebApiTokenIo(join(stateDir(), API_TOKEN_FILE_SEGMENT), {})
    expect(io.readTokenFile()).toBeUndefined()
  })

  it('reads and trims an existing token file', () => {
    const root = stateDir()
    const file = join(root, API_TOKEN_FILE_SEGMENT)
    writeFileSync(file, `${GOOD}\n`)
    expect(createWebApiTokenIo(file, {}).readTokenFile()).toBe(GOOD)
  })

  it('propagates a non-ENOENT read error (e.g. the path is a directory)', () => {
    const root = stateDir()
    const asDir = join(root, API_TOKEN_FILE_SEGMENT)
    mkdirSync(asDir)
    expect(() => createWebApiTokenIo(asDir, {}).readTokenFile()).toThrow()
  })

  it('writes the token atomically at mode 0600, creating the state dir', () => {
    const file = join(stateDir(), 'nested', API_TOKEN_FILE_SEGMENT)
    const io = createWebApiTokenIo(file, {})
    io.writeTokenFile(GOOD)
    expect(readFileSync(file, 'utf8')).toBe(GOOD)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('generates a 32-byte hex token', () => {
    expect(createWebApiTokenIo('/unused', {}).generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('logs the file path, never the token', () => {
    const lines: string[] = []
    const io = createWebApiTokenIo('/state/api-token', {}, line => lines.push(line))
    io.logGenerated('/state/api-token')
    expect(lines[0]).toContain('/state/api-token')
    expect(lines[0]).toContain('cat /state/api-token')
  })

  it('resolves end-to-end against a fresh state dir: generate then reuse', () => {
    const file = join(stateDir(), API_TOKEN_FILE_SEGMENT)
    const first = resolveWebApiToken(createWebApiTokenIo(file, {}))
    expect(first.source).toBe('generated')
    const second = resolveWebApiToken(createWebApiTokenIo(file, {}))
    expect(second).toEqual({ token: first.token, source: 'file' })
  })
})
