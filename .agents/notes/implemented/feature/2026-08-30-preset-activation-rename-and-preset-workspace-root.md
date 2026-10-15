# Agent Note: Preset activation, display rename, and preset-derived default cwd

Status: implemented

## Problem

The MTIL deployment manages presets from Odoo and needs three abilities the roster did not have: hide a preset from pickers without deleting it (sessions already composed from it must keep running and resuming), rename a preset's display text without moving anything keyed by its id, and give every session created without an explicit location a per-preset working directory (`~/workspace/<presetId>`) instead of the harness process cwd shared by all callers.

## Decision

- **Authored presets are registry declarations.** `@deepseek-ai/dsh-mtil-presets` stores each authored preset as `<root>/<id>/agent.cordis.yml` (entry-list YAML) beside an optional `preset.yml`, and declares it through `ctx.agentPresets.register()`; the registry then mounts, retires, and binds it like any deployment-declared preset. Its Remote namespace is `mtilPresets` (`list`, `copy`, `deletePreset`, `author`, `writeRaw`, `rename`, `setActive`, `toolCatalog`); `agentPresets/read` stays the registry's.
- **Activation is a roster flag, not preset metadata.** Deactivated ids live in `<root>/.mtil-roster.json`, which covers deployment-declared presets too. The Odoo mirror archives the preset, so Odoo stops offering it; the harness does not refuse the id, so resume and running sessions are untouched.
- **Rename re-declares with new display text only** (stored presets only; description and `order` preserved). The id is the directory name and stays fixed, which keeps every id-derived path — including the per-preset workspace directory below — stable.
- **The preset-derived default cwd is deployment config**, `presetWorkspaceRoot` on `dsh-api-session-controller`: when a create names neither a Workspace nor a cwd, the cwd becomes `<root>/<presetId>` (requested preset, else the registry default id; directory created with the session). Unset keeps `process.cwd()`.
- **Structured authoring generates rows, raw text stays the exception.** `mtilPresets/author` builds rows from the default preset's rows (read through `agentPresets/read`): replace the persona row, drop `tool-bash`/`tool-pwsh`/`tool-web` rows the spec withholds, drop the `delegation` group for standalone, append fixed `dsh-tool-subagent` department rows and an optional `dsh-mcp-client` Odoo row whose server path is the deployment's `odooMcpServer`. `mtilPresets/writeRaw` (caller-supplied rows, shell-equivalent trust) is wildcard-gated under `ticketSecret`. Ticket verification lives in `dsh-user-ticket`.
- **Preset directories are Workspace groups.** Under `presetWorkspaceRoot` the session controller ensures a Workspace at each preset directory titled by the preset's display name, re-syncs a lagging title on every ensure, attaches sessions created into the derived cwd, and runs a lazy one-shot reconcile before the first `session/list`. All best-effort: grouping is presentation and never fails a session.

## Alternatives considered

**Carry activation in the preset's own metadata.** Deployment-declared presets are not stored by this package, so the flag has nowhere to live for exactly the presets a deployment most wants to hide.

**Enforce activation at mount.** A deactivated preset would then break the sessions already composed from it, which is the opposite of the requirement.

**Rename by changing the preset id.** The id is the directory name, so every id-derived path moves with it — including the per-preset workspace directory this note adds. Rewriting display text only keeps the id a stable key.

**Hardcode the preset workspace root.** A fixed path cannot suit two deployments, and it would change the cwd of stock installations that never asked for it. `presetWorkspaceRoot` left unset keeps the existing `process.cwd()` behavior.

**Accept raw composition text as the normal authoring path.** The caller would name plugins directly, which is shell-equivalent trust for anyone who can reach the wire. Structured authoring generates rows from the default preset's rows, and `mtilPresets/writeRaw` stays the deliberate exception: wildcard-gated, shape-validated, and read-only in the Odoo UI until raw editing is turned on.

**Teach the sidebar a second grouping axis for presets.** Grouping is Workspace membership by design. Ensuring a Workspace at each preset directory reuses that rule, so preset sessions group without the sidebar learning what a preset is.

## Consequences

Odoo can hide a preset from its pickers, retitle it, and give it a working directory, and no id-derived path moves when any of that happens.

Activation is a picker concern, not an authorization control: a deactivated id still mounts, resumes, and runs, and a caller naming it directly is unaffected.

Raw composition writing is shell-equivalent trust. It is gated on the `*` wildcard under `ticketSecret`, which puts that secret on the `mtil-presets` row of the deployment overlay as well as the session-controller row — one secret with two configured homes, and both must move together.

The workspace behaviors are best-effort by design: the lazy one-shot reconcile and the attach on create fail into Ungrouped rather than into a failed session, and a renamed preset's group is re-titled when its next Session is created.
