/**
 * Mandatory API-token resolution for the web deployment. The web profile always
 * boots with Bearer-token authentication active, so a valid token must always
 * exist. Resolution order, highest first:
 *
 * 1. the `DSH_API_TOKEN` environment variable when set — an operator override,
 *    validated for length like a configured token, and never persisted;
 * 2. a token persisted by a previous boot at the harness state root;
 * 3. otherwise a fresh crypto-random token, persisted (0600, written
 *    atomically) and logged once by file path.
 *
 * A persisted file that exists but is unreadable or malformed (short/empty)
 * fails loud rather than being silently regenerated over an operator's file;
 * wrong permissions on an otherwise-readable file are left as they are. The
 * filesystem, env, clock, and console are injected as {@link WebApiTokenIo} so
 * the decision is unit-testable and this module owns no ambient state.
 * @module @deepseek-ai/dsh-web-app/api-token
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The state-root-relative filename of the persisted token (`<state-root>/api-token`). */
export const API_TOKEN_FILE_SEGMENT = 'api-token'

/**
 * Minimum accepted token length, mirroring the connection plugin's
 * `MIN_API_TOKEN_LENGTH` so a resolved token always satisfies its validator.
 * Generated tokens are far longer (32 random bytes as hex).
 */
export const MIN_WEB_API_TOKEN_LENGTH = 16

/** Injected filesystem/env/clock/console the resolver drives; fakeable in tests. */
export interface WebApiTokenIo {
  /** `DSH_API_TOKEN` value, or undefined when unset. */
  readonly envToken: string | undefined
  /** Absolute path of the persisted token file. */
  readonly tokenFile: string
  /** Read the persisted token (trimmed), undefined when the file is absent; throws on any other read error. */
  readTokenFile(): string | undefined
  /** Persist a freshly generated token atomically at mode 0600. */
  writeTokenFile(token: string): void
  /** A fresh crypto-random token. */
  generateToken(): string
  /** Log the one-time generation line (file path only, never the token value). */
  logGenerated(path: string): void
}

/** Where a resolved token came from. */
export type WebApiTokenSource = 'env' | 'file' | 'generated'

/** A resolved token plus its provenance. */
export interface ResolvedWebApiToken {
  readonly token: string
  readonly source: WebApiTokenSource
}

/**
 * Resolve the web deployment's API token, generating and persisting one on a
 * fresh install. See the module contract for the order and failure rules.
 * @param io - the injected filesystem/env/clock/console.
 * @returns the resolved token and its source.
 * @throws Error when the env override is too short, or a persisted file exists
 * but is malformed (a read error from {@link WebApiTokenIo.readTokenFile}
 * propagates unchanged).
 */
export function resolveWebApiToken(io: WebApiTokenIo): ResolvedWebApiToken {
  const env = io.envToken
  if (env !== undefined) {
    if (env.length < MIN_WEB_API_TOKEN_LENGTH) {
      throw new Error(
        `web-app: DSH_API_TOKEN must be at least ${String(MIN_WEB_API_TOKEN_LENGTH)} characters`,
      )
    }
    return { token: env, source: 'env' }
  }
  const existing = io.readTokenFile()
  if (existing !== undefined) {
    if (existing.length < MIN_WEB_API_TOKEN_LENGTH) {
      throw new Error(
        `web-app: the persisted API token at ${io.tokenFile} is malformed (shorter than `
        + `${String(MIN_WEB_API_TOKEN_LENGTH)} characters); refusing to overwrite it — `
        + 'delete the file to regenerate, or set DSH_API_TOKEN',
      )
    }
    return { token: existing, source: 'file' }
  }
  const token = io.generateToken()
  io.writeTokenFile(token)
  io.logGenerated(io.tokenFile)
  return { token, source: 'generated' }
}

/**
 * Build the production {@link WebApiTokenIo} over the real filesystem, process
 * environment, and console.
 * @param tokenFile - absolute path of the persisted token (from the bundle's `dshHomePath('api-token')`).
 * @param env - environment mapping (defaults to `process.env`).
 * @param log - line sink (defaults to `console.log`).
 * @returns the IO the resolver drives.
 */
export function createWebApiTokenIo(
  tokenFile: string,
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = console.log,
): WebApiTokenIo {
  return {
    envToken: env.DSH_API_TOKEN,
    tokenFile,
    readTokenFile() {
      try {
        return readFileSync(tokenFile, 'utf8').trim()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    },
    writeTokenFile(token) {
      mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 })
      // Write to a unique sibling then rename, so a reader never observes a
      // partially written token and a crash cannot leave a truncated file.
      const temporary = `${tokenFile}.${String(process.pid)}.${randomBytes(6).toString('hex')}.tmp`
      writeFileSync(temporary, token, { mode: 0o600 })
      renameSync(temporary, tokenFile)
    },
    generateToken() {
      return randomBytes(32).toString('hex')
    },
    logGenerated(path) {
      log(`dsh web: no API token found; generated one at ${path} — read it with: cat ${path}`)
    },
  }
}
