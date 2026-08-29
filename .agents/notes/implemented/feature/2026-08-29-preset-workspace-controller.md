# Agent Note: Preset management with a provisioned per-preset workspace

Status: implemented

English | [Tiếng Việt](2026-08-29-preset-workspace-controller.vi.md)

## Problem

The MTIL skill-authoring flow depends on `preset.workspace_id`: each agent preset owns a workspace, and the Odoo/MTIL front holds that id to attribute and author skills against it through `ctx.remote.skillAuthoring`. Stock 0.1.2 `agentPresets/copy` only clones a preset directory and returns void — it provisions no workspace and hands back no id. The fork's old implementation (`apps/host/apiproxy/src/preset-workspace.ts`) provided exactly this, but it was written against the deleted apiproxy RPC layer and an older preset roster that could stamp a `workspacePath` onto each preset. The 0.1.2 `AgentPresets` roster is discovery-only: it reads presets from directories on every call and stores no workspace reference, so the old stamping mechanism is gone.

## Decision

Add a new Typert Remote controller `@deepseek-ai/dsh-api-preset-workspace-controller` that owns the `presetWorkspace` namespace and layers the workspace lifecycle over the stock 0.1.2 machinery instead of reimplementing it.

Preset authoring is delegated to `ctx.agentPresets` (its Remote-export methods already map preset failures onto the wire) and workspace registration to `ctx.workspaceRegistry`. The controller only sequences the two and links them.

**The preset↔workspace link is the conventional path `<presetWorkspacesRoot>/<presetId>`**, ported from the fork's pure path module. Because the 0.1.2 roster stores no workspace reference, the convention is the only durable link: a preset's workspace is found again from the preset id alone by resolving that path in the registry. `presetWorkspacesRoot` is a validated `Config` field resolved once at construction (absent → `<home>/workspace`; `~/`-prefixed expands; relative is rejected loud at load).

`copy` clones the preset first (validating source, id, and writable root through `ctx.agentPresets`), then `mkdir`s the conventional directory and registers it as a workspace; a failed provision rolls the copied preset back so no preset is ever left without a workspace. `remove` resolves the workspace id from the convention, deletes the preset (validating existence and writability), then unregisters the workspace, retaining its files. `list` and `read` project each preset beside the id of its provisioned workspace, or `''` when none is registered yet.

Every method takes a single `request` object so the gateway wire is uniformly `{ args: { request: {...} } }`.

## Return-shape deviation from the fork

The old implementation returned a full workspace projection stamped onto the preset. This controller returns only the ids the Odoo consumer needs and derives the link by convention rather than by a stored field:

- `copy` returns `{ agentPreset: string; workspace: string }` (the new preset id and its workspace id).
- `list` rows carry `workspaceId: string` (`''` when unprovisioned), `broken` as a boolean (the roster's `broken` reason is projected to a flag), and `trust`/`isDefault`/`name`/`description` from the roster.
- `read` returns `{ agentPreset, workspaceId, content, name?, description? }`.
- `remove` returns `void`.

The Odoo module must read `workspace_id` from `copy`'s `workspace` field and from `list`/`read`'s `workspaceId`, and treat `''` as "no workspace provisioned".

## Consequences

The `presetWorkspace` namespace is mounted by the MTIL overlay only; the shipped Web profile is unchanged. A preset copied outside this controller (through plain `agentPresets/copy`) has no workspace and reads back `workspaceId: ''` until one is provisioned at its conventional path.

## Verification

- `npx tsc -b packages/api/preset-workspace-controller/tsconfig.json` — clean.
- `npx vitest run packages/api/preset-workspace-controller/tests` — 22 tests: pure path rules (root resolution, id safety, mapping) and the controller composed over a real `WorkspaceRegistry` plus a roster double (copy provisions, failed provision rolls back, remove drops both, list/read carry the workspace id, and each failure maps to its stable code).
- Deferred to a running harness: that `ctx.agentPresets` and `ctx.workspaceRegistry` both resolve on the host plane of the assembled MTIL/web composition, and that the generated `ctx.remote.presetWorkspace` client is reachable end to end.
