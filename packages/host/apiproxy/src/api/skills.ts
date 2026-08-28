/**
 * skills domain contract. `list` is a read-only, session-addressed catalog
 * lookup (the session's header cwd resolves to the canonical project root
 * host-side, and lookup never creates or resumes an Agent). `read` reads one
 * skill's content either session-addressed (the resolved catalog body, matching
 * `list`) or workspace-addressed (the authored on-disk file). `write`/`remove`
 * are workspace-addressed authoring, so an operator (Odoo/MTIL front) holding a
 * workspace id can manage skills without a live session. None of these resolve
 * an Agent: authoring reads and writes the workspace's on-disk skill directory,
 * and the session-addressed reads use the host-resident session header only.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from './workspace.ts'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Skill catalog row (wire projection of the host SkillSummary; provider/source vocabulary stays host-side). */
export interface SkillEntry {
  /** Kebab-case identifier the user references as `/name` in the composer. */
  readonly name: string
  /** Short routing description. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** False marks a user-only skill (`disable-model-invocation`): invocable here, absent from the model catalog. */
  readonly modelInvocable: boolean
}

/**
 * Skill-domain unary methods (the map key skill.* of RpcMethodMap). Listing
 * is the domain's only RPC: invocation itself is a plain `session.prompt`
 * whose leading `/name` token the host recognizes at the pre-step boundary
 * (`dsh-tool-skill` injects the rendered body there), so every client shares
 * one deterministic path with no dedicated invocation wire.
 */
/** Authored skill fields returned by `skill.read`. */
export interface SkillContent {
  /** Short routing description from the file's frontmatter. */
  readonly description: string
  /** Optional extra routing guidance from the file's frontmatter. */
  readonly whenToUse?: string
  /** The skill body (everything after the frontmatter block). */
  readonly content: string
}

export interface SkillsApi {
  /** Lists the user-invocable skill catalog for the session's project. */
  list(request: RpcRequest<{ sessionId: SessionId }>): Promise<RpcResponse<{ skills: readonly SkillEntry[] }>>

  /**
   * Reads one skill's frontmatter fields and body, addressed one of two ways:
   *
   * - `workspaceId` — the authored file at that workspace's
   *   `.agents/skills/<name>/SKILL.md`. An unknown workspace fails with
   *   `workspace-not-found`; an invalid name with `skill-invalid-name`; a
   *   missing file with `skill-not-found`; a path escaping the workspace skills
   *   directory with `forbidden`.
   * - `sessionId` — the resolved catalog skill the session sees (the body the
   *   model would load), so a skill discovered from any root, not only an
   *   authored workspace file, returns content. Mirrors `list`'s addressing: an
   *   unattached session fails with `session-not-found`; a name absent from the
   *   catalog with `skill-not-found`.
   */
  read(request: RpcRequest<
    | { workspaceId: WorkspaceId; name: string }
    | { sessionId: SessionId; name: string }
  >): Promise<RpcResponse<SkillContent>>

  /**
   * Writes one skill file into a workspace's `.agents/skills/<name>/SKILL.md`,
   * assembling frontmatter (`name`, `description`, and `whenToUse` when given)
   * plus the body and creating the directory when absent. An oversized body
   * fails with `skill-too-large`; the same name and containment failures as
   * `read` apply. Returns the written skill name.
   */
  write(request: RpcRequest<{
    workspaceId: WorkspaceId
    name: string
    description: string
    whenToUse?: string
    content: string
  }>): Promise<RpcResponse<{ name: string }>>

  /**
   * Removes one skill directory from a workspace. Idempotent: a name with no
   * directory returns `{ removed: false }`. The same workspace, name, and
   * containment failures as `read` apply.
   */
  remove(request: RpcRequest<{ workspaceId: WorkspaceId; name: string }>):
  Promise<RpcResponse<{ removed: boolean }>>
}
