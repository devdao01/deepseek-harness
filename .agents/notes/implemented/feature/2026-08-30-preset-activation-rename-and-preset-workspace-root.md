# Agent Note: Preset activation, display rename, and preset-derived default cwd

Status: implemented

## Problem

The MTIL deployment manages presets from Odoo and needs three abilities the roster did not have: hide a preset from pickers without deleting it (sessions already composed from it must keep running and resuming), rename a preset's display text without moving anything keyed by its id, and give every session created without an explicit location a per-preset working directory (`~/workspace/<presetId>`) instead of the harness process cwd shared by all callers.

## Decision

- **Activation is a setting, not preset metadata.** Deactivated ids live in a `disabled` list in the `agent-presets` settings namespace, because shipped presets are read-only on disk and the settings document already hot-reloads. The roster row gains a required `active` flag; `agentPresets/setActive` maintains the list (unset when empty). Enforcement sits in `select` only — the one path that installs a NEW composition choice — never in the mount, so resume and running sessions are untouched.
- **Rename rewrites `preset.yml` display text only** (`agentPresets/rename`, user-root presets only, description and `order` preserved). The id is the directory name and stays fixed, which is what keeps every id-derived path — including the per-preset workspace directory below — stable across renames.
- **The preset-derived default cwd is deployment config**, `presetWorkspaceRoot` on `dsh-api-session-controller`, not a hardcoded path: when a create names neither a Workspace nor a cwd, the cwd becomes `<root>/<presetId>` (requested preset, else the roster default id; directory created with the session). Unset keeps the existing `process.cwd()` behavior, so stock deployments are unchanged.
- **Authoring materializes the workspace eagerly**: `agent-presets` emits `agent-preset/authored` after a copy commits, and the session controller — the config owner — mkdirs `<root>/<presetId>` on it (best-effort; session creation still owns the directory), so files can be staged before the preset's first session. The config stays in one place instead of being duplicated into the preset package.
