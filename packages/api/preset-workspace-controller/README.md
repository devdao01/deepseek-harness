---
description: "Host Remote owner for preset management with a provisioned per-preset workspace: list, read, copy (clone + provision), and remove (delete + unregister)."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-preset-workspace-controller

## Summary

Stock 0.1.2 `agentPresets/copy` clones a preset directory and returns void — it provisions no workspace. This package owns `ctx.remote.presetWorkspace`, which pairs each agent preset with a workspace so the Odoo/MTIL front gets a `preset.workspace_id` to attribute and author skills against. It delegates preset authoring to `ctx.agentPresets` and workspace registration to `ctx.workspaceRegistry`, and links the two by the conventional path `<presetWorkspacesRoot>/<presetId>` because the 0.1.2 preset roster stores no workspace reference.

## Use this package

Mount it (the MTIL overlay does this over the Web profile) and drive the `presetWorkspace` namespace. Every method takes a single `request` object, so the wire is uniformly `{ args: { request: {...} } }`:

- `list(request: {})` → `{ presets: { id, workspaceId, name?, description?, trust?, isDefault?, broken? }[] }`. `workspaceId` is `''` when the preset has no provisioned workspace.
- `read(request: { id })` → `{ agentPreset, workspaceId, content, name?, description? }`.
- `copy(request: { from, id, name? })` → `{ agentPreset, workspace }`. Clones preset `from` → `id` and provisions its workspace, returning the new preset id and workspace id. A failed provision rolls the copied preset back.
- `remove(request: { id })` → `void`. Deletes the preset and unregisters its workspace (files are retained).

Failures arrive as `TypertRemoteFailure`: the stable agent-preset codes (`bad-request`, `agent-preset-not-found`, `agent-preset-invalid`, `agent-preset-read-only`) from `ctx.agentPresets`, plus `directory-create-failed` when workspace provisioning fails.

## Configure

`presetWorkspacesRoot` (optional): absolute or `~/`-prefixed directory under which per-preset workspaces are provisioned. Absent defaults to `<home>/workspace`; a relative value is rejected at construction.

## Understand the implementation

- `src/preset-workspace.ts` — pure path rules: root resolution (with load-time validation), preset-id segment safety, and the `<root>/<presetId>` mapping.
- `src/index.ts` — `PresetWorkspaceController extends TypertRemoteService` (`inject: ['typert', 'workspaceRegistry', 'agentPresets']`), sequencing preset authoring and workspace provisioning with rollback.
- `src/types.ts` — the request and value shapes the wire carries.

## Known Limitations and Deferred Work

The preset↔workspace link is by convention only; a preset copied through plain `agentPresets/copy` has no workspace until one is provisioned at its conventional path. Whether `ctx.agentPresets` and `ctx.workspaceRegistry` both resolve on the host plane of the assembled composition, and end-to-end reachability of the generated `ctx.remote.presetWorkspace` client, are verified in a running harness, not in this package's tests.
