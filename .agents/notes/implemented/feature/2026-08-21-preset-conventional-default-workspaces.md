# Agent Note: Preset-conventional default workspaces

Status: implemented

English | [中文](2026-08-21-preset-conventional-default-workspaces.zh.md)

## Problem

Authoring a preset with `agentPreset.copy` created a composition but left the user to make and register a workspace for it by hand before any session could land somewhere sensible. There was no convention tying a preset to a directory, so a freshly copied `accounting` preset started sessions in the host process cwd like every other unnamed create. The user story is direct: creating preset `accounting` should also give it a default workspace at `~/workspace/accounting`, and starting a session under that preset should land there without the client having to name a workspace.

## Decision

A conventional mapping — preset `<id>` ⇄ `<presetWorkspacesRoot>/<id>` — provisioned at copy time and honored at session-create time.

**Config and resolution.** A new `ApiProxyService` config field `presetWorkspacesRoot?: string` (schemastery `z.string()`, cordis-changeable) names the root. Resolution is an explicit load-time step, not a hidden `??`: `resolvePresetWorkspacesRoot(configured, os.homedir())` maps absent → `<home>/workspace`, a `~/` prefix → home-relative, and requires any other value to be absolute, throwing on a relative value so misconfiguration fails loud at construction rather than silently rooting workspaces at the process cwd. The pure resolution, the id-safety check, and the id→path join live in the gated `src/preset-workspace.ts` (per-file 100% coverage); `createApiProxy` calls the resolver once at construction, and the resolver is idempotent on an already-absolute value so re-resolving a plugin-resolved root is a no-op.

**`agentPreset.copy` provisions.** After the preset copy succeeds, the handler computes `<root>/<agentPreset>`, `mkdir -p`s it, and creates-or-adopts a workspace over it through the same `ensureWorkspace` chain `workspace.create` uses (idempotent: a re-copy or an existing directory adopts rather than fails). The response grew from `{ agentPreset }` to `{ agentPreset, workspace: WorkspaceView }`. The id is checked with `isPresetWorkspaceIdSafe` — rejecting a separator or a `.`/`..` segment with `agent-preset-invalid` — before anything is copied, so a dangerous id never reaches the roster or a `join`. Copy-then-provision is one operation: if provisioning fails after the preset was copied, the just-copied preset is removed (rollback through the authoring `remove` path) and the call answers `directory-create-failed` naming the path.

**`session.create` preset-conventional default.** The cwd chain gained one step before `workspace?.path ?? cwd ?? defaults.cwd`: when a create names neither a `workspaceId` nor a `cwd` but does name an `agentPreset`, the handler looks up the registry for a workspace whose canonical path equals `<root>/<agentPreset>` and, when found, treats it exactly as a named workspace — the session attaches to it and takes its path as cwd, reusing the existing attach path rather than only setting cwd. A missing registration (or a directory that no longer exists — `resolveByPath` rejects on a `realpath` ENOENT, which is caught) falls through to `defaults.cwd`; only `copy` provisions, so a deleted registration stays the user's choice and is never auto-created. A create without an `agentPreset` (the DEFAULT preset) gets no conventional lookup. The lookup is guarded by `ctx.get('workspaceRegistry')` so a deployment or test without the registry mounted simply skips it.

## Alternatives considered

**Auto-mkdir the conventional directory inside `session.create` when it is missing.** Rejected: a session-create that silently recreates a directory the user deleted would fight the user's intent, and the registry is the record of what workspaces exist. Only `copy` — the explicit authoring act — provisions; `session.create` reads.

**Resolving `presetWorkspacesRoot` with a hidden `?? join(homedir(), 'workspace')` inside `run()`.** Rejected per the repo's "defaulting is an explicit resolve step, never a hidden `??` inside run" rule, and because a relative misconfiguration would then silently root workspaces at the process cwd. The explicit resolver throws at load instead.

**Returning only `{ agentPreset }` and letting the client fetch the workspace via `workspace.list`.** Rejected: the copy is the commit point that knows the provisioned workspace, and echoing it lets the client group the new preset's workspace without a follow-up round-trip — the same reasoning `session.create` already uses to echo the resolved preset.

**Validating the id only through authoring's own preset-id rules.** Rejected as insufficient for the path `join`: the containment guard must not trust that authoring forbids separators or `..`, so `isPresetWorkspaceIdSafe` re-checks before building any filesystem path.

## Consequences

Creating a preset now yields a ready workspace, and a preset-only session lands in it — the user story end to end. `presetWorkspacesRoot` is the one new knob; its default keeps zero-config deployments at `~/workspace/<preset>`. The copy response is a wire change (`{ agentPreset, workspace }`); the fixture in `dsh-client-connection` mirrors it, and the two apiproxy carrier test stubs were updated. The feature is not model-visible and emits no session event, so no snapshot fixture and no `SESSION_FORMAT_VERSION` bump are involved. `agentPreset.copy` now depends on a mounted `workspaceRegistry` (always present in production, in the service inject list); the preset-only unit harness opts the registry in only where a copy is exercised. Provisioning adds a `mkdir` and a registry write to each copy, and rollback adds a preset remove to the rare failure path; both are bounded and local.
