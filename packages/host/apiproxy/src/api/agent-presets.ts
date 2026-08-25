/**
 * agent-presets domain contract: the roster a browser offers when starting a
 * session, plus the authoring calls behind it.
 *
 * `list` is ordinary: it carries ids and trust, and every preset picker needs
 * it. The authoring calls are privileged and loopback-pinned — a composition
 * names the plugins a session runs, so reading one is reconnaissance, and
 * although authoring is copy-only (no caller supplies composition text or a
 * path), copying and deleting still rearrange what the deployment offers.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'
import type { WorkspaceView } from './workspace.ts'

/** One preset the deployment can compose a session's agent from. */
export interface AgentPresetEntry {
  /** Stable identifier, also the display name until presets carry metadata. */
  readonly id: string
  /**
   * Whether the preset ships with the deployment or was authored locally.
   * A `user` preset is exactly as privileged as the plugins it names, so a
   * surface offering one should say so rather than present it as vetted.
   */
  readonly trust: 'system' | 'user'
  /** Whether a session that names no preset gets this one. */
  readonly isDefault: boolean
  /**
   * Display name the preset published, absent when it published none. A
   * surface falls back to {@link id}; it is never a second identity, and it
   * never decides trust — a locally authored preset cannot name itself into
   * the shipped set.
   */
  readonly name?: string
  /** One sentence on what the preset is for, when it published one. */
  readonly description?: string
  /**
   * Absolute path of the preset's conventional default workspace, recorded
   * when the preset was authored; absent for shipped presets and copies made
   * before the stamp existed, whose sessions fall back to the conventional
   * `<presetWorkspacesRoot>/<id>` location.
   */
  readonly workspacePath?: string
  /**
   * Why this preset cannot compose a session, absent when it can. A broken
   * preset stays listed — its directory still occupies the id, so a surface
   * must be able to show and delete it — but offering it for selection would
   * only defer this reason to a failed session start.
   */
  readonly broken?: string
  /**
   * Whether the preset was intentionally turned off, absent when it is
   * enabled. A disabled preset stays listed so a surface can show it and turn
   * it back on, but must not offer it for selection: the Host refuses to
   * compose a new session from it exactly as it refuses a broken one. Odoo
   * mirrors this as the record's `active` flag.
   */
  readonly disabled?: boolean
}

/** agent-preset-domain unary methods (the map key agentPreset.* of RpcMethodMap). */
export interface AgentPresetsApi {
  /**
   * Lists every preset the deployment currently supplies, in root-precedence
   * order — the roots as configured, each root's own presets sorted by id,
   * and the first root to supply an id wins. The order is not globally
   * sorted: a user root's preset sits in that root's block, not among the
   * shipped ids.
   * An empty roster means the deployment composes no presets at all, and
   * every session shares the host composition. `authorable` reports whether
   * the deployment configures a root new presets can be written to, and
   * `hasDocument` whether `openDocument` can hand a preset directory to a
   * native opener — both deployment facts rather than per-preset ones, and
   * neither exposes a Host path.
   */
  list(request: RpcRequest<{}>):
  Promise<RpcResponse<{ presets: readonly AgentPresetEntry[]; authorable: boolean; hasDocument: boolean }>>

  /**
   * Recompose one session's agent from a different preset.
   *
   * Allowed only while the session is blank — no turn has run. Once a
   * conversation starts, its history was produced under that preset's tools,
   * and swapping them would leave logged tool calls the new composition cannot
   * make; the attempt answers `agent-preset-locked`.
   */
  select(request: RpcRequest<{ sessionId: SessionId; agentPreset: string }>):
  Promise<RpcResponse<{ agentPreset: string }>>

  /**
   * Read one preset's composition text, for the read-only viewer.
   *
   * Privileged: a composition names the plugins a session runs, so reading
   * one is reconnaissance.
   */
  read(request: RpcRequest<{ agentPreset: string }>):
  Promise<RpcResponse<{
    agentPreset: string
    trust: 'system' | 'user'
    content: string
    name?: string
    description?: string
  }>>

  /**
   * Create a locally authored preset by copying an existing one whole, and
   * provision its conventional default workspace as one operation.
   *
   * The only authoring write. No composition text and no path crosses the
   * wire: `from` and `agentPreset` are ids the Host resolves against its own
   * roots, so a copy is exactly as loadable as its source and grants nothing
   * the roster did not already carry. The copy keeps the source's description
   * (the file is the author's to edit afterwards) but not its name — `name`
   * here or the id fallback is what distinguishes the rows.
   *
   * After the copy, the preset's conventional workspace (`<root>/<agentPreset>`)
   * is created or an existing directory/record adopted idempotently, its
   * canonical path is stamped onto the new preset's metadata (so a later
   * `session.create` prefers the stored path over the recomputed convention),
   * and the response carries that `WorkspaceView`. An id that cannot be a
   * single path segment (a separator or `..`) is refused with
   * `agent-preset-invalid` before anything is copied. Copy-then-provision is
   * atomic: if provisioning or the stamp fails, the just-copied preset is
   * removed and the call answers `directory-create-failed` naming the path.
   */
  copy(request: RpcRequest<{ from: string; agentPreset: string; name?: string }>):
  Promise<RpcResponse<{ agentPreset: string; workspace: WorkspaceView }>>

  /**
   * Set a locally authored preset's display name and/or description in its
   * `preset.yml`, preserving its `order` and stamped workspace path.
   *
   * Privileged authoring: it edits what the deployment's picker shows for a
   * `user` preset, which `copy` cannot do afterwards — a copy keeps the
   * source's description and the id fallback for its name. Composition stays
   * copy-only; this only edits display metadata and the disabled flag, so no
   * plugin row crosses the wire. A provided display string SETS the field, an
   * empty or whitespace one CLEARS it, `disabled: true`/`false` turns the
   * preset off/on, and an omitted field KEEPS the current value; the response
   * reports the effective name/description and disabled state read back after
   * the edit. A preset that ships with the deployment is refused with
   * `agent-preset-read-only`.
   */
  update(request: RpcRequest<{ agentPreset: string; name?: string; description?: string; disabled?: boolean }>):
  Promise<RpcResponse<{ name?: string; description?: string; disabled?: boolean }>>

  /**
   * Hand one locally authored preset's DIRECTORY to the platform opener, for
   * editing the files that are now the only composition editor. The request
   * carries an id, never a path — the Host resolves it — so no browser
   * payload can select an arbitrary filesystem target. Where the deployment
   * has no native opener (`hasDocument: false` on `list`), the reply carries
   * the resolved directory for the surface to show as text instead. Shipped
   * presets are refused: their install is not the user's to manage.
   */
  openDocument(request: RpcRequest<{ agentPreset: string }>, signal: AbortSignal):
  Promise<RpcResponse<{ opened: true } | { opened: false; path: string }>>

  /** Delete a locally authored preset. Shipped presets are refused. */
  remove(request: RpcRequest<{ agentPreset: string }>): Promise<RpcResponse<{}>>
}
