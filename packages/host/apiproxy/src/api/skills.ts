/**
 * skills domain contract. Two addressing modes coexist: `list` is a read-only,
 * session-addressed catalog lookup (the session's header cwd resolves to the
 * canonical project root host-side, and lookup never creates or resumes an
 * Agent); `read`/`write`/`remove` are workspace-addressed authoring of one
 * skill file's content, so an operator (Odoo/MTIL front) holding a workspace id
 * can manage skills without a live session. Authoring never resolves an Agent
 * either — it reads and writes the workspace's on-disk skill directory.
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
   * Reads one skill file's authored content from a workspace's
   * `.agents/skills/<name>/SKILL.md`. An unknown workspace fails with
   * `workspace-not-found`; an invalid name with `skill-invalid-name`; a
   * missing file with `skill-not-found`; a path escaping the workspace skills
   * directory with `forbidden`.
   */
  read(request: RpcRequest<{ workspaceId: WorkspaceId; name: string }>):
  Promise<RpcResponse<SkillContent>>

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
