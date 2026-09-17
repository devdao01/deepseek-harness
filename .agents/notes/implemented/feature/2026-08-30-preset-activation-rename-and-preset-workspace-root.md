# Agent Note: Preset activation, display rename, and preset-derived default cwd

Status: implemented

## Problem

The MTIL deployment manages presets from Odoo and needs three abilities the roster did not have: hide a preset from pickers without deleting it (sessions already composed from it must keep running and resuming), rename a preset's display text without moving anything keyed by its id, and give every session created without an explicit location a per-preset working directory (`~/workspace/<presetId>`) instead of the harness process cwd shared by all callers.

## Decision

- **Activation is a setting, not preset metadata.** Deactivated ids live in a `disabled` list in the `agent-presets` settings namespace, because shipped presets are read-only on disk and the settings document already hot-reloads. The roster row gains a required `active` flag; `agentPresets/setActive` maintains the list (unset when empty). Enforcement sits in `select` only — the one path that installs a NEW composition choice — never in the mount, so resume and running sessions are untouched.
- **Rename rewrites `preset.yml` display text only** (`agentPresets/rename`, user-root presets only, description and `order` preserved). The id is the directory name and stays fixed, which is what keeps every id-derived path — including the per-preset workspace directory below — stable across renames.
- **The preset-derived default cwd is deployment config**, `presetWorkspaceRoot` on `dsh-api-session-controller`, not a hardcoded path: when a create names neither a Workspace nor a cwd, the cwd becomes `<root>/<presetId>` (requested preset, else the roster default id; directory created with the session). Unset keeps the existing `process.cwd()` behavior, so stock deployments are unchanged.
- **Authoring materializes the workspace eagerly**: `agent-presets` emits `agent-preset/authored` after a copy commits, and the session controller — the config owner — mkdirs `<root>/<presetId>` on it (best-effort; session creation still owns the directory), so files can be staged before the preset's first session. The config stays in one place instead of being duplicated into the preset package.
- **Structured authoring generates compositions, raw text stays out of the wire.** `agentPresets/author` builds a standalone or router composition from the default preset's own file: replace the persona row, drop `tool-bash`/`tool-pwsh`/`tool-web` rows the spec withholds, drop the `delegation` group for standalone, append fixed `dsh-tool-subagent` department rows (spawn, one-shot, maxDepth 1, toolFilter derived from bash/web flags). The Odoo module manages both kinds as form fields (`kind`, `persona`, capability flags, sub-agent lines with an explicit tool grant picked from the `agentPresets/toolCatalog`-synced catalog) and re-authors on edit; the copy-only stance survives because the caller still never names a plugin. The deliberate exception is `agentPresets/writeRaw` (raw `agent.cordis.yml`, shell-equivalent trust): wildcard-gated under `ticketSecret` (the secret now also lives on the agent-presets row of the deployment overlay), shape-validated (YAML + top-level plugin-row list), surfaced in Odoo as a read-only Composition tab with the push action wired but the field kept readonly until raw editing is deliberately enabled. The ticket verification's canonical home moved out of session-controller into `dsh-user-ticket` (`currentTicketUserId`/`verifyUserTicket`, re-exported by `dsh-client-connection`) because both session-controller and agent-presets read it and session-controller depends on agent-presets.
- **Preset directories are Workspace groups.** Sidebar grouping is Workspace membership (explicit `attachSession`), so preset sessions were all falling into Ungrouped. Under `presetWorkspaceRoot` the session controller ensures a Workspace at each preset directory titled by the preset's display name (`agent-preset/renamed` retitles it; `workspaceRegistry.create(path, title)` regains a production caller — see the deletion TODO it cancels), attaches sessions created into the derived cwd, and runs a lazy one-shot reconcile before the first `session/list` to adopt directories and stored sessions that predate the feature. All best-effort: grouping is presentation and never fails a session.

## Alternatives considered

**Carry activation in the preset's own metadata.** Shipped presets are read-only on disk, so the flag has nowhere to live for exactly the presets a deployment most wants to hide. The settings document already hot-reloads, which is what the roster needs.

**Enforce activation at mount.** A deactivated preset would then break the sessions already composed from it, which is the opposite of the requirement. Only `select` installs a new composition choice, so that is the one path that refuses a deactivated id.

**Rename by changing the preset id.** The id is the directory name, so every id-derived path moves with it — including the per-preset workspace directory this note adds. Rewriting display text only keeps the id a stable key.

**Hardcode the preset workspace root.** A fixed path cannot suit two deployments, and it would change the cwd of stock installations that never asked for it. `presetWorkspaceRoot` left unset keeps the existing `process.cwd()` behavior.

**Duplicate the workspace-root config into the preset package.** Two owners for one deployment value. `agent-presets` emits `agent-preset/authored` instead and the session controller, which owns the config, creates the directory.

**Accept raw composition text as the normal authoring path.** The caller would name plugins directly, which is shell-equivalent trust for anyone who can reach the wire. Structured authoring generates the composition from the default preset's own file, and `agentPresets/writeRaw` stays the deliberate exception: wildcard-gated, shape-validated, and read-only in the Odoo UI until raw editing is turned on.

**Teach the sidebar a second grouping axis for presets.** Grouping is Workspace membership by design. Ensuring a Workspace at each preset directory reuses that rule, so preset sessions group without the sidebar learning what a preset is.

## Consequences

Odoo can hide a preset from pickers, retitle it, and give it a working directory, and no id-derived path moves when any of that happens. `workspaceRegistry.create(path, title)` regains a production caller, which cancels the deletion TODO standing against it.

Activation is a picker concern, not an authorization control: a deactivated id still mounts, resumes, and runs, and a caller naming it directly is unaffected. That is what keeps live sessions safe, and it means activation must never be read as a permission.

Raw composition writing exists and is shell-equivalent trust. It is gated on the `*` wildcard under `ticketSecret`, which puts that secret on the agent-presets row of the deployment overlay as well as the session-controller row — one secret with two configured homes, and both must move together.

The workspace behaviors are best-effort by design: the eager mkdir on authoring, the lazy one-shot reconcile before the first `session/list`, and the attach on create all fail into Ungrouped rather than into a failed session. A grouping fault therefore shows up as presentation drift, not as an error anyone is paged for.
