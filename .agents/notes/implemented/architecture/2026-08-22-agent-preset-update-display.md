# Agent Note: Settable preset display metadata after a copy

Status: implemented

English | [中文](2026-08-22-agent-preset-update-display.zh.md)

## Problem

`agentPreset.copy` keeps the SOURCE preset's description on the new copy and derives its name from the id (or a supplied `name`), on the reasoning that "the file is the author's to edit afterwards". But there was no afterwards: the only way to change a `user` preset's display text was to hand-edit `preset.yml` through `openDocument`, or to delete and re-copy. A surface that lets a user rename a preset or fix its one-line description had no RPC to call.

## Decision

Add `agentPreset.update`, a privileged authoring RPC that sets a locally authored preset's display `name` and/or `description` in its `preset.yml`, preserving `order` and the stamped `workspacePath`. It mirrors the existing `writePresetWorkspacePath`/`setWorkspacePath` seam exactly rather than inventing a new one.

- **Package seam.** `writePresetDisplay(roots, preset, updates)` in `dsh-agent-presets/authoring` applies the same two guards as `writePresetWorkspacePath`: `user` trust only, and the resolved directory must live under the writable root. It reads current metadata, merges only the keys PRESENT in `updates` (`'name' in updates`), and renders through `renderPresetMetadata`. When the merge clears everything, it `rm`s `METADATA_FILE` (force) so the preset publishes nothing rather than a blank document; otherwise it writes atomically at mode 0o600. The service method is `AgentPresets.setDisplay(id, updates)`.
- **Set / clear / keep.** A field present as a non-empty string sets it; present as empty or whitespace clears it (through the same `text()` normalization the file already round-trips); absent keeps the current value. This is the exact three-way behavior the wire method exposes.
- **Effective values echoed.** The gateway builds `updates` from the payload keys present, calls `setDisplay`, then RE-RESOLVES the preset and returns its effective `name`/`description` (omitting undefined like `read` does), so a client that cleared a field sees it gone.
- **Composition stays copy-only.** `update` carries only display text — no plugin rows, no composition text, no path. It grants nothing beyond what `copy` already did; it only edits what the picker shows.

Enforcement stays where the sibling seam puts it. Trust and writable-root guards live in `writePresetDisplay`, not the gateway — the same place `writePresetWorkspacePath` enforces them. A shipped preset is refused with `PresetNotWritableError` ("it ships with the deployment"), mapped by the gateway to `agent-preset-read-only`, exactly like `openDocument`. `agentPreset.update` is registered in `PRIVILEGED_METHODS` (dsh-client-connection) and `DEFAULT_UNPINNED_METHODS` (api-auth) alongside `read`/`copy`/`openDocument`/`remove`: it is loopback-pinned and, under the mandatory-web token, reachable by an authenticated client only.

## Alternatives considered

- **Fold name/description into a widened `setWorkspacePath`.** Rejected: the two edits have different guards in spirit (a workspace stamp is part of copy-then-provision; a display edit is standalone) and different clear semantics, and one method taking every metadata field invites callers to overwrite `order` or `workspacePath` they never meant to touch. `'key' in updates` scoping keeps each write to exactly what it names.
- **Let the caller edit `preset.yml` through `openDocument` only.** Rejected: that is a native-desktop affordance and a raw-YAML surface, not something a browser rename dialog can drive; it also has no set/clear/keep contract.
- **Allow renaming any preset, shipped ones included.** Rejected: the shipped install is the deployment's, not the user's — the same line `copy`/`remove`/`openDocument`/`setWorkspacePath` already draw.

## Consequences

`preset.yml` gains no new field — `name` and `description` already existed and already round-trip through `renderPresetMetadata`/`readPresetMetadata` — so there is no `SESSION_FORMAT_VERSION` change: display metadata is not a session event, and `update` is full-token session management that never enters the agent loop and produces no model-visible output. No keyless snapshot is required for the same reason `copy`/`remove` need none. A copy is now editable after the fact, so the "the file is the author's to edit afterwards" premise `copy` was written against finally has an in-product path. Composition remains copy-only: no method on this seam accepts plugin rows.
