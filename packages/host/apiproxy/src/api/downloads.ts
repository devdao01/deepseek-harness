/**
 * downloads domain contract: host-only download surfaces — the GET-download
 * channel family, the mirror of the SSE-stream `events` domain. No wire
 * envelope: the carrier's GET routes answer these directly, and the browser
 * `IApiClient` never exposes them.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Host-only download surfaces (no wire envelope; absent from IApiClient). */
export interface DownloadsApi {
  /**
   * Stream one session-log ZIP — the root artifact verbatim plus each subagent
   * descendant's — as an attachment response. The carrier's GET route answers
   * this directly; the browser never calls it.
   * @param request - the root session id and whether to include descendants.
   * @param signal - cancellation for the underlying reads.
   * @returns the ZIP attachment response; missing services answer 500 and a
   * missing root session 404 before any byte is produced.
   */
  sessionLog(
    request: { sessionId: SessionId; includeDescendants?: boolean },
    signal: AbortSignal,
  ): Promise<Response>

  /**
   * Stream one regular file from a session's workspace directory as an
   * attachment download. The carrier's GET route answers this directly; the
   * browser `IApiClient` never exposes it.
   *
   * Containment is the security core: the session's own cwd is the root, the
   * requested path is resolved against it (an absolute path used as-is, a
   * relative one joined to the root), and BOTH the root and the requested file
   * are `realpath`-canonicalized so a symlink cannot escape. The canonical file
   * must equal the canonical root or sit beneath `canonicalRoot + sep`;
   * anything else is refused. Reachability is the deployment's trust fence (the
   * API carries no auth); a reachable client can already exfiltrate any
   * workspace file by prompting the agent, so a workspace-CONTAINED read widens
   * nothing — containment only stops it from becoming an arbitrary host-file
   * read.
   * @param request - the session whose workspace roots the read, and the file
   * path (absolute or relative to that workspace).
   * @param signal - cancellation for the underlying file read.
   * @returns the file attachment response: 200 streaming the bytes
   * (`application/octet-stream`, `content-length`, and a `content-disposition`
   * attachment naming the file's basename); 404 for an unknown session, a
   * missing file, or a non-regular file (directory, fifo, …); 403 for a file
   * that resolves outside the session workspace.
   */
  workspaceFile(
    request: { sessionId: SessionId; path: string },
    signal: AbortSignal,
  ): Promise<Response>
}
