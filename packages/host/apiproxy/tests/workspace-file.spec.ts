/**
 * workspace.file host path: the GET download endpoint streams one regular file
 * from a session's workspace directory as an attachment, after proving the
 * file is contained by that workspace. Escapes (`../` and symlink) are refused
 * with 403, an unknown session / missing file / non-regular file with 404, and
 * a bad query with 400.
 */

import { mkdtemp, mkdir, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { createApiProxy, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'

const sid = (id: string): SessionId => id as SessionId

/**
 * Assemble an ApiProxy that resolves one session's cwd. `live` provides the
 * cwd through the live-session store; `cold` provides it through a persistence
 * inspection; `inspectThrows` mounts a persistence whose inspect rejects (an
 * unknown persisted session).
 */
async function buildApi(options: {
  live?: { sessionId: string; cwd: string | undefined }
  cold?: { sessionId: string; cwd: string | undefined }
  inspectThrows?: boolean
} = {}) {
  const ctx = new Context()
  await ctx.plugin(UserQuestionService)
  if (options.live !== undefined) {
    const { sessionId, cwd } = options.live
    ctx.provide('sessions', {
      get: (id: SessionId) => id === sid(sessionId) ? { header: { cwd } } : undefined,
    } as never)
  }
  if (options.cold !== undefined || options.inspectThrows === true) {
    ctx.provide('sessionPersistence', {
      supportsRawArtifacts: true,
      inspect: async (id: SessionId) => {
        if (options.inspectThrows === true) throw new Error('/host/private/no-such-session.jsonl')
        if (options.cold !== undefined && id === sid(options.cold.sessionId)) {
          return { meta: { cwd: options.cold.cwd } }
        }
        throw new Error('/host/private/unexpected-session')
      },
    } as never)
  }
  return createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    cwd: '/tmp',
  })
}

async function makeWorkspace(): Promise<string> {
  // realpath so the containment comparison is against the canonical root even
  // when the OS tempdir itself is a symlink (macOS /tmp → /private/tmp).
  return realpath(await mkdtemp(join(tmpdir(), 'dsh-wsfile-')))
}

const GET = (sessionId: string, path: string): Request =>
  new Request(`http://host/api/workspace.file?sessionId=${sessionId}&path=${encodeURIComponent(path)}`)

describe('workspace.file download endpoint', () => {
  it('streams a regular file with octet-stream, content-length, and an attachment name', async () => {
    const cwd = await makeWorkspace()
    await writeFile(join(cwd, 'report.txt'), 'hello workspace')
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'report.txt'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('content-length')).toBe(String('hello workspace'.length))
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="report.txt"; filename*=UTF-8\'\'report.txt',
    )
    expect(await response.text()).toBe('hello workspace')
  })

  it('resolves the file for a cold session through a persistence inspection', async () => {
    const cwd = await makeWorkspace()
    await writeFile(join(cwd, 'cold.txt'), 'cold bytes')
    const api = await buildApi({ cold: { sessionId: 'cold-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('cold-1', 'cold.txt'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cold bytes')
  })

  it('accepts an absolute path that already sits inside the workspace', async () => {
    const cwd = await makeWorkspace()
    const absolute = join(cwd, 'nested', 'deep.txt')
    await mkdir(join(cwd, 'nested'))
    await writeFile(absolute, 'absolute body')
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', absolute))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('absolute body')
    expect(response.headers.get('content-disposition')).toContain('filename="deep.txt"')
  })

  it('encodes a non-ASCII basename with an ASCII fallback and an RFC 5987 ext-value', async () => {
    const cwd = await makeWorkspace()
    await writeFile(join(cwd, 'café report.txt'), 'unicode name')
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'café report.txt'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="caf_ report.txt"; filename*=UTF-8\'\'caf%C3%A9%20report.txt',
    )
  })

  it('answers 200 with headers but no body for a HEAD request', async () => {
    const cwd = await makeWorkspace()
    await writeFile(join(cwd, 'head.txt'), 'head body')
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(
      new Request('http://host/api/workspace.file?sessionId=live-1&path=head.txt', { method: 'HEAD' }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String('head body'.length))
    expect(response.body).toBeNull()
  })

  it('refuses a relative path that escapes the workspace with 403', async () => {
    const cwd = await makeWorkspace()
    const secret = join(cwd, '..', 'outside-secret.txt')
    await writeFile(secret, 'not yours')
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', '../outside-secret.txt'))
    expect(response.status).toBe(403)
  })

  it('refuses a symlink whose target is outside the workspace with 403', async () => {
    const cwd = await makeWorkspace()
    const outside = join(await makeWorkspace(), 'target.txt')
    await writeFile(outside, 'external target')
    await symlink(outside, join(cwd, 'link.txt'))
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'link.txt'))
    expect(response.status).toBe(403)
  })

  it('answers 404 for an unknown session with no live or persisted record', async () => {
    const api = await buildApi()
    const response = await toFetchHandler(api).fetch(GET('missing', 'anything.txt'))
    expect(response.status).toBe(404)
  })

  it('answers 404 when the persisted session inspection fails', async () => {
    const api = await buildApi({ inspectThrows: true })
    const response = await toFetchHandler(api).fetch(GET('broken', 'anything.txt'))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a session whose recorded workspace no longer exists on disk', async () => {
    const api = await buildApi({ live: { sessionId: 'live-1', cwd: '/tmp/dsh-wsfile-does-not-exist' } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'report.txt'))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a session whose header records no workspace cwd', async () => {
    const api = await buildApi({ live: { sessionId: 'live-1', cwd: undefined } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'report.txt'))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a missing file inside a real workspace', async () => {
    const cwd = await makeWorkspace()
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'nope.txt'))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a directory rather than a regular file', async () => {
    const cwd = await makeWorkspace()
    await mkdir(join(cwd, 'subdir'))
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', 'subdir'))
    expect(response.status).toBe(404)
  })

  it('answers 404 for a path that resolves to the workspace root itself', async () => {
    const cwd = await makeWorkspace()
    const api = await buildApi({ live: { sessionId: 'live-1', cwd } })
    const response = await toFetchHandler(api).fetch(GET('live-1', '.'))
    expect(response.status).toBe(404)
  })

  it('answers 400 when the path query parameter is absent', async () => {
    const api = await buildApi({ live: { sessionId: 'live-1', cwd: '/tmp' } })
    const response = await toFetchHandler(api).fetch(
      new Request('http://host/api/workspace.file?sessionId=live-1'),
    )
    expect(response.status).toBe(400)
  })

  it('answers 400 when the sessionId query parameter is absent', async () => {
    const api = await buildApi({ live: { sessionId: 'live-1', cwd: '/tmp' } })
    const response = await toFetchHandler(api).fetch(
      new Request('http://host/api/workspace.file?path=report.txt'),
    )
    expect(response.status).toBe(400)
  })
})
