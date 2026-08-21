/**
 * Host-side workspace-file download: streams one regular file from a session's
 * workspace directory as an attachment response, after proving the file is
 * contained by that workspace.
 *
 * The containment rule is the security core. The session's own cwd is the
 * root; the requested path is resolved against it (absolute used as-is,
 * relative joined to the root). BOTH the root and the requested file are
 * `realpath`-canonicalized so a symlink inside the workspace cannot escape it,
 * and the canonical file must equal the canonical root or sit beneath
 * `canonicalRoot + sep`. Anything outside is refused with 403 before any byte
 * is streamed. Reachability is the deployment's trust fence — the API carries
 * no auth, and a reachable client can already exfiltrate any workspace file by
 * prompting the agent — so a workspace-CONTAINED read widens nothing;
 * containment only stops it from becoming an arbitrary host-file read.
 * @module
 */

import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

/** RFC 5987 attr-char set: the bytes that survive an ext-value unencoded. */
const RFC5987_ATTR_CHAR = /[A-Za-z0-9!#$&+\-.^_`|~]/

/**
 * Percent-encode a filename's UTF-8 bytes as an RFC 5987 ext-value so a
 * non-ASCII download name survives the `content-disposition` header intact.
 * @param name - the raw filename.
 * @returns the ext-value (every non attr-char byte percent-encoded).
 */
function encodeExtValue(name: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(name)) {
    if (byte < 0x80 && RFC5987_ATTR_CHAR.test(String.fromCharCode(byte))) {
      out += String.fromCharCode(byte)
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

/**
 * Build a `content-disposition` attachment value naming one file. The quoted
 * `filename` is an ASCII fallback (non-ASCII, quote, and backslash bytes
 * neutralized) for legacy clients; the `filename*` ext-value carries the exact
 * UTF-8 name for clients that honor RFC 5987.
 * @param name - the file's basename.
 * @returns the header value.
 */
function attachmentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeExtValue(name)}`
}

/**
 * Resolve a requested path inside a session workspace and stream the file it
 * names as an attachment response, or answer 403/404 when the path escapes the
 * workspace or is not a readable regular file.
 * @param cwd - the session's workspace directory (the containment root).
 * @param requestPath - the requested file path (absolute, or relative to cwd).
 * @param signal - cancellation forwarded to the file read.
 * @returns 200 streaming the file bytes; 403 outside the workspace; 404 for a
 * missing file or a non-regular file (directory, fifo, …).
 */
export async function streamWorkspaceFile(
  cwd: string,
  requestPath: string,
  signal: AbortSignal,
): Promise<Response> {
  const requested = isAbsolute(requestPath) ? requestPath : resolve(cwd, requestPath)
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(cwd)
  } catch {
    // The session's own workspace root is gone from disk: nothing to serve,
    // and echoing the error would leak an absolute host path to the browser.
    return new Response('workspace file not found', { status: 404 })
  }
  let canonicalFile: string
  let stats: Awaited<ReturnType<typeof stat>>
  try {
    canonicalFile = await realpath(requested)
    stats = await stat(canonicalFile)
  } catch {
    // Missing file (realpath/stat ENOENT) or an unreadable one: 404 without
    // leaking the backend error's host path.
    return new Response('workspace file not found', { status: 404 })
  }
  if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(canonicalRoot + sep)) {
    return new Response('workspace file is outside the session workspace', { status: 403 })
  }
  if (!stats.isFile()) {
    return new Response('workspace file not found', { status: 404 })
  }
  const body = Readable.toWeb(createReadStream(canonicalFile, { signal })) as ReadableStream<Uint8Array>
  return new Response(body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(stats.size),
      'content-disposition': attachmentDisposition(basename(canonicalFile)),
    },
  })
}
