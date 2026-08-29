/**
 * Host Remote owner of the `presetWorkspace` namespace: preset management with a
 * provisioned per-preset workspace. Stock 0.1.2 `agentPresets/copy` clones a
 * preset directory and returns void; the MTIL skill-authoring flow needs each
 * preset to own a workspace (`preset.workspace_id`) so an operator (the
 * Odoo/MTIL front) can attribute and author skills against it. This controller
 * layers that over the 0.1.2 machinery: it delegates preset authoring to
 * `ctx.agentPresets` and workspace registration to `ctx.workspaceRegistry`, and
 * links the two by convention — a preset's workspace lives at
 * `<presetWorkspacesRoot>/<presetId>`, because the 0.1.2 preset roster stores no
 * workspace reference to carry the link itself.
 *
 * Every method takes a single `request` object, so the gateway wire is
 * uniformly `{ args: { request: {...} } }`. None of these resolve an Agent.
 *
 * @module @deepseek-ai/dsh-api-preset-workspace-controller
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Type-only: resolves the `ctx.agentPresets` roster this controller delegates to.
import type {} from '@deepseek-ai/dsh-agent-presets'
import { isPresetWorkspaceIdSafe, presetWorkspacePath, resolvePresetWorkspacesRoot } from './preset-workspace.ts'
import type {
  PresetWorkspaceCopyRequest,
  PresetWorkspaceCopyValue,
  PresetWorkspaceListRequest,
  PresetWorkspaceListValue,
  PresetWorkspaceReadRequest,
  PresetWorkspaceReadValue,
  PresetWorkspaceRemoveRequest,
} from './types.ts'

export * from './preset-workspace.ts'
export type * from './types.ts'

/** The user-writable slice of this controller's config. */
export interface Config {
  /**
   * Absolute (or `~/`-prefixed) directory under which per-preset workspaces are
   * provisioned. Absent defaults to `<home>/workspace`; a relative value is
   * rejected at construction.
   */
  presetWorkspacesRoot?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `presetWorkspace` Remote namespace. */
    presetWorkspaceController: PresetWorkspaceController
  }
}

/**
 * Host service backing the generated `ctx.remote.presetWorkspace` namespace.
 *
 * Preset authoring (`copy`/`remove`/`read`/`list`) is delegated to
 * `ctx.agentPresets`, which already maps its failures onto the wire; workspace
 * provisioning goes through `ctx.workspaceRegistry`. The preset↔workspace link
 * is the conventional path `<presetWorkspacesRoot>/<presetId>`, resolved once at
 * construction.
 */
export class PresetWorkspaceController extends TypertRemoteService {
  static inject = ['typert', 'workspaceRegistry', 'agentPresets']

  /** Runtime schema for the user-writable slice. */
  static Config: z<Config> = z.object({
    presetWorkspacesRoot: z.string(),
  }) as z<Config>

  /** Absolute root under which per-preset workspaces are provisioned. */
  private readonly workspacesRoot: string

  /**
   * @param ctx - Host context carrying the preset roster and workspace registry.
   * @param config - the user-writable slice; `presetWorkspacesRoot` is resolved here.
   */
  constructor(ctx: Context, config?: Config) {
    super(ctx, 'presetWorkspaceController', { namespace: 'presetWorkspace' })
    // Explicit defaulting at load, not a hidden `?? default` in a method: a
    // relative root fails loud here rather than rooting workspaces at cwd.
    this.workspacesRoot = resolvePresetWorkspacesRoot(config?.presetWorkspacesRoot, homedir())
  }

  /**
   * Every preset the deployment supplies, each beside the id of its provisioned
   * workspace (`''` when none is registered yet).
   * @param request - empty.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the preset rows with their workspace ids.
   */
  @Remote('list')
  async list(request: PresetWorkspaceListRequest, signal: AbortSignal): Promise<PresetWorkspaceListValue> {
    void request
    void signal
    const roster = await this.ctx.agentPresets.remoteExportList()
    const presets = await Promise.all(roster.presets.map(async row => ({
      id: row.id,
      workspaceId: await this.workspaceIdFor(row.id),
      ...row.name === undefined ? {} : { name: row.name },
      ...row.description === undefined ? {} : { description: row.description },
      trust: row.trust,
      isDefault: row.isDefault,
      broken: row.broken !== undefined,
    })))
    return { presets }
  }

  /**
   * One preset's composition text beside the id of its provisioned workspace.
   * @param request - the preset id.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the composition, workspace id, and published metadata.
   * @throws {TypertRemoteFailure} `bad-request` for an empty id, or
   * `agent-preset-not-found` when no configured root supplies it.
   */
  @Remote('read')
  async read(request: PresetWorkspaceReadRequest, signal: AbortSignal): Promise<PresetWorkspaceReadValue> {
    void signal
    const document = await this.ctx.agentPresets.readDocument(request.id)
    return {
      agentPreset: document.agentPreset,
      workspaceId: await this.workspaceIdFor(document.agentPreset),
      content: document.content,
      ...document.name === undefined ? {} : { name: document.name },
      ...document.description === undefined ? {} : { description: document.description },
    }
  }

  /**
   * Clone a preset and provision its per-preset workspace.
   *
   * The preset copy commits first (validating the source, the id, and the
   * writable root through `ctx.agentPresets`); the conventional directory is
   * then created and registered as a workspace. A failed provision rolls the
   * copied preset back, so a caller never sees a preset with no workspace.
   * @param request - the source preset, the new id, and an optional display name.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the new preset id and the provisioned workspace id.
   * @throws {TypertRemoteFailure} the stable agent-preset codes when the copy is
   * refused, or `directory-create-failed` when provisioning fails.
   */
  @Remote('copy')
  async copy(request: PresetWorkspaceCopyRequest, signal: AbortSignal): Promise<PresetWorkspaceCopyValue> {
    void signal
    await this.ctx.agentPresets.remoteExportCopy(request.from, request.id, request.name)
    // The copy succeeded, so `id` is a validated single-segment preset id and
    // the conventional path cannot escape the root.
    const path = presetWorkspacePath(this.workspacesRoot, request.id)
    try {
      await mkdir(path, { recursive: true })
      const workspace = await this.ctx.workspaceRegistry.create(path, request.name ?? request.id)
      return { agentPreset: request.id, workspace: String(workspace.id) }
    } catch (error: unknown) {
      await this.rollbackPreset(request.id)
      throw new TypertRemoteFailure({
        code: 'directory-create-failed',
        message: `failed to provision the workspace for preset "${request.id}": ${errorMessage(error)}`,
        details: { path },
      })
    }
  }

  /**
   * Delete a preset and its provisioned workspace.
   *
   * The preset deletion commits first (validating existence and writability
   * through `ctx.agentPresets`); the conventional workspace registration, when
   * one exists, is then removed. Files are retained — only the registration is
   * dropped, matching `workspace.delete`.
   * @param request - the preset id.
   * @param signal - caller lifetime carried by the Remote transport.
   * @throws {TypertRemoteFailure} the stable agent-preset codes when deletion is refused.
   */
  @Remote('remove')
  async remove(request: PresetWorkspaceRemoveRequest, signal: AbortSignal): Promise<void> {
    void signal
    // Resolved before the preset is removed; the path is derived from the id and
    // does not depend on the preset still existing.
    const workspaceId = await this.workspaceIdFor(request.id)
    await this.ctx.agentPresets.remoteExportDelete(request.id)
    if (workspaceId !== '') {
      await this.ctx.workspaceRegistry.delete(WorkspaceId(workspaceId))
    }
  }

  /**
   * The id of a preset's conventional workspace, or `''` when none is
   * registered. Returns `''` for an unsafe id rather than building a path that
   * could resolve outside the root.
   */
  private async workspaceIdFor(presetId: string): Promise<string> {
    if (!isPresetWorkspaceIdSafe(presetId)) return ''
    const path = presetWorkspacePath(this.workspacesRoot, presetId)
    try {
      const workspace = await this.ctx.workspaceRegistry.resolveByPath(path)
      return workspace === undefined ? '' : String(workspace.id)
    } catch {
      // `resolveByPath` realpaths the directory; an unprovisioned preset has no
      // such directory (ENOENT), which means no workspace — not an error.
      return ''
    }
  }

  /** Roll the just-copied preset back after a failed provision; best-effort. */
  private async rollbackPreset(presetId: string): Promise<void> {
    try {
      await this.ctx.agentPresets.remove(presetId)
    } catch (error: unknown) {
      // The provision failure is the caller-facing error; a failed rollback must
      // not mask it, so it is logged rather than thrown.
      this.ctx.logger.warn(
        `preset-workspace: failed to roll back preset "${presetId}" after a provision failure: ${errorMessage(error)}`,
      )
    }
  }
}

/** Render an unknown throw as a message string for a wire failure. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default PresetWorkspaceController
