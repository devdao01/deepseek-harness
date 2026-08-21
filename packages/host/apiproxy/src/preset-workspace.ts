/**
 * Preset-conventional workspace paths. Creating an agent preset provisions a
 * default workspace under a conventional root — preset `accounting` maps to
 * `<root>/accounting` — and a session that names only that preset attaches to
 * the same directory. This module owns the pure path logic: resolving the
 * configured root (with its load-time validation) and mapping a preset id to
 * its directory. All filesystem and registry effects live in the api-proxy
 * wiring; nothing here touches disk.
 * @module
 */

import { isAbsolute, join } from 'node:path'

/** Directory name under the home directory used when no root is configured. */
export const DEFAULT_PRESET_WORKSPACES_DIRNAME = 'workspace'

/**
 * Resolve the directory under which preset-conventional workspaces live. This
 * is the explicit defaulting step the plugin runs at load, not a hidden
 * fallback: an absent value becomes `<home>/workspace`; a `~/`-prefixed value
 * expands against the home directory; any other value must already be
 * absolute, and a relative one is rejected here so misconfiguration fails loud
 * at load rather than silently rooting workspaces at the process cwd.
 * @param configured - the raw `presetWorkspacesRoot` config value, if any.
 * @param homeDir - the home directory (`os.homedir()`), passed in so the rule stays pure.
 * @returns the absolute conventional-workspaces root.
 * @throws Error when a configured value is neither `~/`-prefixed nor absolute.
 */
export function resolvePresetWorkspacesRoot(configured: string | undefined, homeDir: string): string {
  if (configured === undefined) return join(homeDir, DEFAULT_PRESET_WORKSPACES_DIRNAME)
  if (configured.startsWith('~/')) return join(homeDir, configured.slice(2))
  if (!isAbsolute(configured)) {
    throw new Error(
      `presetWorkspacesRoot must be an absolute path or start with "~/": got ${JSON.stringify(configured)}`,
    )
  }
  return configured
}

/**
 * Whether a preset id is safe to use as a single directory segment under the
 * conventional root. The `join` that builds the path must never trust the id:
 * a path separator or a `.`/`..` segment would let the preset escape the root,
 * so those ids are refused before any directory is touched.
 * @param presetId - the preset id.
 * @returns true when the id is a single, non-escaping path segment.
 */
export function isPresetWorkspaceIdSafe(presetId: string): boolean {
  return presetId.length > 0
    && !presetId.includes('/')
    && !presetId.includes('\\')
    && presetId !== '.'
    && presetId !== '..'
}

/**
 * The conventional workspace directory for one preset: `<root>/<presetId>`.
 * The caller has already checked the id with {@link isPresetWorkspaceIdSafe}.
 * @param root - the conventional-workspaces root (from {@link resolvePresetWorkspacesRoot}).
 * @param presetId - the preset id (a validated single path segment).
 * @returns the joined directory path.
 */
export function presetWorkspacePath(root: string, presetId: string): string {
  return join(root, presetId)
}
