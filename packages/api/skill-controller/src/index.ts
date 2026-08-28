/**
 * Host Remote owner of the `skillAuthoring` namespace: workspace-addressed
 * management of one skill file at `<workspace.path>/.agents/skills/<name>/SKILL.md`.
 *
 * The session-addressed catalog listing (`ctx.remote.skills.list`) is owned by
 * `dsh-api-session-controller`; this package is its workspace-addressed
 * counterpart, so an operator (the Odoo/MTIL front) holding a workspace id can
 * enumerate one preset's own authored skills and read/write/remove their files
 * without a live session. None of these resolve an Agent — they read and write
 * the workspace's on-disk skill directory through `dsh-api-skill-controller`'s
 * pure `skill-authoring` helpers.
 *
 * @module @deepseek-ai/dsh-api-skill-controller
 */

import { Context } from '@deepseek-ai/cordis'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SkillAuthoringError, listWorkspaceSkills, readSkill, removeSkill, writeSkill } from './skill-authoring.ts'
import type {
  SkillContent,
  SkillListValue,
  SkillReadRequest,
  SkillRemoveRequest,
  SkillRemoveValue,
  SkillWorkspaceListRequest,
  SkillWriteRequest,
  SkillWriteValue,
} from './types.ts'

export * from './skill-authoring.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the workspace-addressed `skillAuthoring` Remote namespace. */
    skillAuthoringController: SkillAuthoringController
  }
}

/**
 * Host service backing the generated `ctx.remote.skillAuthoring` namespace. Each
 * method resolves the workspace path from `ctx.workspaceRegistry` (absent →
 * `workspace-not-found`) and maps the typed `SkillAuthoringError` failures —
 * `skill-invalid-name`, `skill-not-found`, `skill-too-large`, `forbidden` — onto
 * the wire. Containment and name safety live in `skill-authoring`.
 */
export class SkillAuthoringController extends TypertRemoteService {
  static inject = ['typert', 'workspaceRegistry']

  /** @param ctx - Host context carrying the workspace registry. */
  constructor(ctx: Context) {
    super(ctx, 'skillAuthoringController', { namespace: 'skillAuthoring' })
  }

  /**
   * List the skills authored in one workspace's `.agents/skills` directory —
   * the operator's per-workspace view, so a sync can attribute each skill to the
   * preset that owns the workspace. Reads frontmatter only. Every entry's
   * `modelInvocable` is `true` (authored files carry no invocation policy).
   * @param request - the workspace to enumerate.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns each authored skill's name, description, and optional whenToUse.
   * @throws TypertRemoteFailure `workspace-not-found`.
   */
  @Remote
  async listWorkspace(request: SkillWorkspaceListRequest, signal: AbortSignal): Promise<SkillListValue> {
    void signal
    const path = this.workspacePath(request.workspaceId)
    const skills = await listWorkspaceSkills(path)
    return {
      skills: skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        modelInvocable: true,
      })),
    }
  }

  /**
   * Read one authored skill file's frontmatter and body.
   * @param request - the workspace and skill name.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the description, optional whenToUse, and body.
   * @throws TypertRemoteFailure `workspace-not-found`, `skill-invalid-name`, `skill-not-found`, or `forbidden`.
   */
  @Remote
  async read(request: SkillReadRequest, signal: AbortSignal): Promise<SkillContent> {
    void signal
    const path = this.workspacePath(request.workspaceId)
    try {
      return await readSkill(path, request.name)
    } catch (error: unknown) {
      throw skillFailure(request.name, error)
    }
  }

  /**
   * Write one skill file, creating `<workspace>/.agents/skills/<name>/` when
   * absent and overwriting any existing `SKILL.md`.
   * @param request - the workspace, skill name, frontmatter, and body.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the written skill name.
   * @throws TypertRemoteFailure `workspace-not-found`, `skill-invalid-name`, `skill-too-large`, or `forbidden`.
   */
  @Remote
  async write(request: SkillWriteRequest, signal: AbortSignal): Promise<SkillWriteValue> {
    void signal
    const path = this.workspacePath(request.workspaceId)
    try {
      return await writeSkill(path, {
        name: request.name,
        description: request.description,
        ...request.whenToUse === undefined ? {} : { whenToUse: request.whenToUse },
        content: request.content,
      })
    } catch (error: unknown) {
      throw skillFailure(request.name, error)
    }
  }

  /**
   * Remove one skill directory. Idempotent: a name with no directory returns
   * `{ removed: false }`.
   * @param request - the workspace and skill name.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns whether a directory was removed.
   * @throws TypertRemoteFailure `workspace-not-found`, `skill-invalid-name`, or `forbidden`.
   */
  @Remote
  async remove(request: SkillRemoveRequest, signal: AbortSignal): Promise<SkillRemoveValue> {
    void signal
    const path = this.workspacePath(request.workspaceId)
    try {
      return await removeSkill(path, request.name)
    } catch (error: unknown) {
      throw skillFailure(request.name, error)
    }
  }

  /** Resolve one workspace id to its canonical directory, or fail `workspace-not-found`. */
  private workspacePath(workspaceId: string): string {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) {
      throw new TypertRemoteFailure({
        code: 'workspace-not-found',
        message: `workspace "${workspaceId}" not found`,
        details: { workspaceId },
      })
    }
    return workspace.path
  }
}

/** Map a `SkillAuthoringError` onto the wire vocabulary; unknown throws stay `internal`. */
function skillFailure(name: string, error: unknown): TypertRemoteFailure {
  if (error instanceof SkillAuthoringError) {
    return new TypertRemoteFailure({ code: error.code, message: error.message, details: { name } })
  }
  return new TypertRemoteFailure({
    code: 'internal',
    message: `skill authoring failed: ${String(error)}`,
    details: {},
  })
}

export default SkillAuthoringController
