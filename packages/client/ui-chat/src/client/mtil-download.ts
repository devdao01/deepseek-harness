/**
 * MTIL frontend `downloadFiles` flag: the standalone SPA's Host has no
 * desktop and the SPA offers no preview pane, so a file link downloads the
 * file instead. The harness-served original never sets the flag.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// The download reads workspace bytes through the Remote namespace.
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'

/**
 * Download one workspace file to the browser when the SPA asks for downloads.
 * @param remote - the Client's Remote namespaces.
 * @param sessionId - the Session whose workspace the path belongs to.
 * @param cwd - the Session's working directory, when known.
 * @param path - the absolute or workspace-relative file path.
 * @returns false when the flag is unset and the caller opens the file as usual.
 * @throws when the Host refuses the read.
 */
export async function mtilDownloadFile(
  remote: Context['remote'],
  sessionId: SessionId,
  cwd: string | undefined,
  path: string,
): Promise<boolean> {
  const flags = (globalThis as { __MTIL_UI__?: { downloadFiles?: boolean } }).__MTIL_UI__
  if (flags?.downloadFiles !== true) return false
  const read = await remote.workspaceFiles.readBytes(sessionId, resolveWorkspacePath(cwd, path), {}, new AbortController().signal)
  if (!read.ok) throw new Error(`file download failed: ${read.error.message}`)
  const url = URL.createObjectURL(new Blob([read.value.data]))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = read.value.absolutePath.split(/[/\\]/).pop() ?? 'download'
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}
