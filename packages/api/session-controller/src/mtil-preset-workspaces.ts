/**
 * MTIL preset workspaces: under `presetWorkspaceRoot`, a Session created with
 * neither a Workspace nor a cwd lands in `<root>/<presetId>`, grouped under a
 * Workspace titled by the preset's display name. Grouping is presentation:
 * every Workspace failure is logged and the Session is still created.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type { SessionCreateRequest } from './types.ts'

/** Preset-derived Session locations and their Workspace groups. */
export class PresetWorkspaces {
  private readonly root: string
  private reconciled = false

  /**
   * @param ctx - Host context carrying the Workspace registry and, when mounted, the preset registry.
   * @param root - the configured `presetWorkspaceRoot` (`~` expands).
   */
  constructor(private readonly ctx: Context, root: string) {
    this.root = resolve(expandHomePath(root))
  }

  /**
   * Direct a create that names no location to its preset's Workspace.
   * @param request - the create request as received.
   * @returns the request unchanged when it names a location or no preset
   * resolves; otherwise the request carrying the preset Workspace, or the
   * preset directory when the Workspace cannot be ensured.
   */
  async target(request: SessionCreateRequest): Promise<SessionCreateRequest> {
    if (request.workspaceId !== undefined || request.cwd !== undefined) return request
    const presetId = request.agentPreset ?? this.ctx.get('agentPresets')?.defaultId
    if (presetId === undefined) return request
    const dir = join(this.root, presetId)
    await mkdir(dir, { recursive: true })
    const workspace = await this.ensure(presetId, dir)
    return workspace === undefined ? { ...request, cwd: dir } : { ...request, workspaceId: workspace.id }
  }

  /**
   * Group every existing preset directory, and every stored Session sitting
   * in one, under its preset Workspace. Runs once per process, from the first
   * `session/list`.
   * @returns when the backfill finishes, or at once after the first call.
   */
  async reconcile(): Promise<void> {
    if (this.reconciled) return
    this.reconciled = true
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return
    const byPath = new Map<string, Workspace>()
    for (const preset of await presets.list()) {
      const dir = join(this.root, preset.id)
      if (!existsSync(dir)) continue
      const workspace = await this.ensure(preset.id, dir)
      if (workspace !== undefined) byPath.set(workspace.path, workspace)
    }
    for (const record of await this.ctx.sessionQuery.listSessions()) {
      const workspace = record.header.cwd === undefined ? undefined : byPath.get(record.header.cwd)
      if (workspace === undefined) continue
      try {
        await workspace.attachSession(record.header.id)
      } catch (error) {
        this.ctx.logger.warn(`session-controller: could not attach session "${record.header.id}" to its preset workspace: ${String(error)}`)
      }
    }
  }

  /** Ensure one preset directory's Workspace, titled by the preset's current display name. */
  private async ensure(presetId: string, dir: string): Promise<Workspace | undefined> {
    const name = await this.displayName(presetId)
    try {
      const existing = await this.ctx.workspaceRegistry.resolveByPath(dir)
      if (existing === undefined) return await this.ctx.workspaceRegistry.create(dir, name)
      if (existing.title !== name) await existing.setTitle(name)
      return existing
    } catch (error) {
      this.ctx.logger.warn(`session-controller: could not ensure the workspace of preset "${presetId}" at ${dir}: ${String(error)}`)
      return undefined
    }
  }

  /** The preset's published name; its id when it publishes none or is unknown. */
  private async displayName(presetId: string): Promise<string> {
    try {
      return (await this.ctx.get('agentPresets')?.readDocument(presetId))?.name ?? presetId
    } catch {
      // An unknown preset still gets its directory grouped, labelled by its id.
      return presetId
    }
  }
}
