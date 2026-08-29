/**
 * Wire types for the `presetWorkspace` Remote namespace: preset management with
 * a provisioned per-preset workspace. Every method takes a single `request`
 * object, so the gateway wire is uniformly `{ args: { request: {...} } }`. Kept
 * free of runtime code so both the Host service and a generated Remote client
 * import them.
 *
 * @module @deepseek-ai/dsh-api-preset-workspace-controller/types
 */

/** One roster row of `presetWorkspace.list`. */
export interface PresetWorkspaceRow {
  /** Preset id; also the conventional workspace directory name. */
  readonly id: string
  /**
   * Id of the preset's provisioned workspace, or `''` when none is registered
   * yet. The link is by convention (`<root>/<id>`): the 0.1.2 preset roster
   * stores no workspace reference, so an unprovisioned preset carries no id.
   */
  readonly workspaceId: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Trust of the root this preset was discovered under (`system` or `user`). */
  readonly trust?: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault?: boolean
  /** Whether the preset cannot currently compose a session. */
  readonly broken?: boolean
}

/** Request for `presetWorkspace.list`. */
export type PresetWorkspaceListRequest = Record<never, never>

/** Value of `presetWorkspace.list`. */
export interface PresetWorkspaceListValue {
  readonly presets: readonly PresetWorkspaceRow[]
}

/** Request for `presetWorkspace.read`. */
export interface PresetWorkspaceReadRequest {
  readonly id: string
}

/** Value of `presetWorkspace.read`. */
export interface PresetWorkspaceReadValue {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** Id of the preset's provisioned workspace, or `''` when none is registered. */
  readonly workspaceId: string
  /** The composition exactly as stored. */
  readonly content: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
}

/** Request for `presetWorkspace.copy`. */
export interface PresetWorkspaceCopyRequest {
  /** The preset the copy starts from. */
  readonly from: string
  /** The new preset's id, which becomes its directory name. */
  readonly id: string
  /** Display name for the copy; absent falls back to the id. */
  readonly name?: string
}

/** Value of `presetWorkspace.copy`: the new preset id and its workspace id. */
export interface PresetWorkspaceCopyValue {
  /** The newly authored preset id. */
  readonly agentPreset: string
  /** The provisioned workspace id. */
  readonly workspace: string
}

/** Request for `presetWorkspace.remove`. */
export interface PresetWorkspaceRemoveRequest {
  readonly id: string
}
