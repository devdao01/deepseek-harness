# Agent Note: Agent-preset disabled flag, mirrored to Odoo `active`

Status: proposed

English | 中文

## Problem

A locally authored agent preset can be created, renamed, and deleted, but not
turned OFF. The only way to stop a `user` preset composing new sessions is to
delete its directory — which also destroys the composition a person spent
effort authoring, and cannot be undone. Deployments that mirror the roster into
Odoo (`npei.agent.preset`) already carry an `active` flag with no harness
meaning behind it: archiving a preset in Odoo changed nothing on the harness,
so the two views disagreed.

What was missing is a reversible "switched off" state: a preset that stays on
the roster (so a surface can present and re-enable it) but that the mounting
paths refuse, exactly as they already refuse a `broken` one. The two are
distinct causes — a broken preset *cannot* load, a disabled one *was turned off
on purpose* — and both must keep the row resolvable for the surfaces that
manage it.

## Proposal

Add a `disabled` flag that lives in the preset's `preset.yml`, is refused at
mount like `broken`, stays listed with the flag, is written only through the
authoring API (user presets only), and mirrors to Odoo's `active` (inverted).

### Preset provider (`dsh-agent-presets`)

- `PresetMetadata.disabled` and `AgentPreset.disabled` are optional booleans.
  `readPresetMetadata` treats ONLY the literal boolean `true` as disabled; every
  other value (absent, `false`, a non-boolean, a `no` word) reads as enabled —
  the same conservative degradation the display fields already use.
  `renderPresetMetadata` writes `disabled: true` only for `true` and omits the
  key otherwise, so a re-enabled preset with no other metadata drops its file
  rather than storing `disabled: false`; `disabled: true` alone is enough to
  keep the file. `discovery.scanRoot` already spreads `...metadata`, so the flag
  propagates onto the roster row with no change there.
- `resolveMountable` throws `PresetMountError(id, 'the preset is disabled')`
  after the `broken` check, so `mount`, `recompose`, and `standingKeyFor` all
  refuse a disabled preset up front. `join`/`composeFrom` is unchanged: a child
  inherits its parent's live generation and never re-resolves the roster, so a
  session already running is never interrupted.
- `setDisplay(id, { name?, description?, disabled? })` and the underlying
  `writePresetDisplay` gain `disabled` with the same present-sets / absent-keeps
  rule: `disabled: true` turns it off, `disabled: false` re-enables (clearing
  the key), an omitted key keeps the current state. Authoring stays confined to
  a `user` root — a shipped preset is refused with the existing read-only guard.

### API proxy contract (`dsh-host-apiproxy`)

- `AgentPresetEntry.disabled` is added to `agentPreset.list` rows (present only
  when the preset is off). `agentPreset.update` gains `disabled?` on both its
  request and its effective-state response. The `list` handler maps
  `preset.disabled`; the `update` handler forwards `disabled` to `setDisplay`
  and re-reads the effective state, exactly as it already does for name and
  description.

### SPA (`dsh-client-ui-agent-preset`)

- `presetOptions` — the single home for "selectable presets" used by both the
  new-session seat chip and the default-preset settings row — filters out
  `disabled` presets alongside `broken` ones, so a disabled preset can never be
  chosen for a new session (consistent with the host's refuse-mount).
- The management section keeps disabled rows (they need re-enabling) and gains
  an Enable/Disable toggle per `user` row, a `Disabled` badge, and a dimmed
  card whose body cannot be made default. Shipped presets carry no toggle
  (read-only on the host).

### Odoo module (`npei_agent_harness`)

- `active` now mirrors the harness `disabled`, inverted. `_push_display` pushes
  `disabled: not active` and is restricted to `user` presets, so archiving a
  system mirror row stays local (the harness would answer
  `agent-preset-read-only`). `write` triggers the push when `active` changes as
  well as name/description. `action_sync_from_harness` reads `disabled` back
  into `active` and finds archived mirrors (`active_test=False`) so a disabled
  sync does not duplicate the row.

## Alternatives considered

**Hide a disabled preset from `list` entirely.** Rejected: the Odoo mirror and
the SPA management page both need the row to present the off state and offer
re-enable, and hiding it would leave the directory occupying its id with nothing
to toggle — the same failure that makes `broken` presets stay listed. Listing
with a flag lets each surface decide (pickers drop it, management keeps it).

**Reuse `broken` for the off state.** Rejected: `broken` carries a
discovery-reported failure reason and means "cannot load"; a disabled preset is
loadable and was switched off on purpose. Collapsing them would mislabel a
healthy preset as damaged and lose the ability to say which is which.

**Store the flag in settings rather than `preset.yml`.** Rejected: the preset's
own directory is the one home for its state (name, description, workspace path
already live there), the flag must travel with a copy or a move, and settings is
the *default-preset* namespace — a per-preset boolean does not belong there.

**Make Odoo `active` local-only (no harness push).** Rejected: the deployment
goal is that archiving a preset in Odoo actually stops it composing sessions.
System presets stay local-only because the harness owns them read-only, but a
user preset must round-trip.

## Acceptance criteria

- A `user` preset with `disabled: true` in `preset.yml` is listed by
  `agentPreset.list` with `disabled: true`, resolves for `resolve`/read/delete,
  and is refused by `mount`, `recompose`, and `standingKeyFor` with a
  `PresetMountError` reading "is disabled".
- `agentPreset.update({ agentPreset, disabled })` turns the preset off/on and
  the effective state is reported back; a shipped preset is refused.
- The SPA pickers (seat chip, default row) never offer a disabled preset; the
  management section shows it with an Enable/Disable toggle and a badge.
- Odoo: archiving a `user` mirror pushes `agentPreset.update` with
  `disabled: true`; archiving a `system` mirror pushes nothing; a sync of
  `disabled: true` sets `active=False` without echoing back.

## Risks

- **A running session is deliberately unaffected.** Disabling a preset stops
  NEW sessions only; sessions already composed keep their generation. This is
  the same contract as delete and is intended, but a user may expect disabling
  to stop an in-flight session — the badge and copy must not imply otherwise.
- **English-only new UI strings.** The three new locale keys (`enable`,
  `disable`, `disabledBadge`) ship English text in the `zh` bundle per the work
  order's no-new-Chinese constraint; a later translation pass owns the Chinese.
- **Bilingual sidecars deferred.** This note's `.zh.md`/`.i18n.yaml` sidecars
  and the `README.zh.md`/`README.vi.md` metadata updates are left to the
  repository's translation workflow rather than authored here.

## Testing

Package unit tests cover metadata parse/render of `disabled`, discovery
propagation, `setDisplay` set/clear, and refuse-at-mount (a VALID composition
carrying `disabled: true`, so the refusal is proven to be the flag, not a broken
row). API-proxy schema round-trips carry the new optional field. SPA store and
component tests cover the picker filter, the section toggle routing, and the
apply-wiring. Odoo tests (harness client mocked, unique `zzz-*` ids) cover the
archive-push, the no-push for system presets, and the disabled-sync-to-inactive.
No agent-loop or `SessionEventMap` surface changes, so neither SDK transcript
nor a new keyless snapshot is required: disabling is refused before any turn
opens, and the model-visible composition of a running session is untouched.
