# Agent Note: Skill authoring RPCs — workspace-addressed skill file management

Status: proposed

English

## Problem

`SkillsApi` served only `skill.list`: a read-only, session-addressed catalog lookup. An operator front (the Odoo/MTIL deployment layer) needs to author skill files — create, read, and delete the content of one skill — without a live session. The operator already holds a workspace id (presets provision a conventional workspace), so the natural address is `(workspaceId, name)`, not a session id.

## Capability

Unary RPCs extend the skills domain. Three operate on one file at `<workspace.path>/.agents/skills/<name>/SKILL.md`:

- `skill.read({ workspaceId, name } | { sessionId, name }) → { description, whenToUse?, content }` — workspace-addressed, reads and splits the authored file: frontmatter → `description`/`whenToUse`, body → `content` (missing file → `skill-not-found`). Session-addressed, resolves the same catalog `skill.list` serves and returns the resolved skill's body (see below).
- `skill.write({ workspaceId, name, description, whenToUse?, content }) → { name }` — assembles a YAML frontmatter block (`name`, `description`, and `whenToUse` when present) + `\n\n` + body, creates the directory when absent, overwrites.
- `skill.remove({ workspaceId, name }) → { removed }` — removes the skill directory; idempotent (`removed: false` when absent).

And one enumerates a workspace's skills:

- `skill.listWorkspace({ workspaceId }) → { skills: SkillEntry[] }` — the skills authored in `<workspace.path>/.agents/skills` (frontmatter only, sorted by name; `modelInvocable: true` since authored files carry no invocation policy). The workspace-addressed counterpart to session-addressed `skill.list`, so an operator can list one preset's own skills rather than a session's merged catalog. An absent skills directory returns `[]`; an unknown workspace fails `workspace-not-found`. A directory with no readable `SKILL.md`, or one a symlink redirects outside the skills root, is skipped.

Each resolves the workspace from `ctx.workspaceRegistry.get(workspaceId)` (absent → `workspace-not-found`) and never creates or resumes an Agent — authoring is pure filesystem I/O over the workspace's canonical path. The format helpers and containment/I/O live in `packages/host/apiproxy/src/skill-authoring.ts`; `api-proxy.ts` only resolves the workspace and maps typed failures onto wire codes.

## Security decisions

- **Full-token-only.** `skill.listWorkspace`/`read`/`write`/`remove` are all in `FULL_TOKEN_ONLY` in `fetch/handler.ts`, alongside `workspace.*` mutation: workspace-addressed skill management is deployment administration the operator front owns. A per-user ticket or anonymous caller is refused with `forbidden` before the payload is parsed. Session-addressed `skill.list` stays ticket-facing (the composer menu); that asymmetry is why `listWorkspace` is a separate method rather than a `skill.list` payload variant — the token gate is per method.
- **Name safety.** `name` must be a single, non-traversing skill segment: `isSkillName` (`@deepseek-ai/dsh-skill`) plus an explicit rejection of `/`, `\`, `.`, and `..`. Invalid → `skill-invalid-name`. The explicit checks keep the path-safety guarantee independent of the `isSkillName` regex.
- **Containment.** The `realpath` of the skill directory must sit beneath the `realpath` of `<workspace.path>/.agents/skills/`, the same pattern `workspace.file` uses, so a symlink planted inside the workspace cannot redirect a write or read outside it. An escape → `forbidden`.
- **Size bound.** The body is capped at a fixed 64 KiB (`SKILL_CONTENT_MAX_BYTES`), a security invariant like `EXECUTABLE_EXTENSIONS` — never deployment config — so authoring cannot become an unbounded host-write channel. Oversize → `skill-too-large`.
- **Only `SKILL.md`.** The write target is always the fixed `SKILL.md` basename under the validated skill directory; no caller-supplied path segment reaches the filesystem.

## Session-addressed read (catalog content sync)

`skill.list` deliberately carries no body (the composer menu stays cheap), so the Odoo/MTIL "Sync from Harness" mirrored only metadata — the `content` field stayed empty. Authored skills are managed workspace-addressed, but most skills the sync mirrors are *discovered* under a project's `.agents/skills` (or `~/.agents/skills`), not authored into a preset workspace, so a workspace-addressed read of them fails `skill-not-found`. The fix is to read them the same way `skill.list` lists them: session-addressed.

`skill.read({ sessionId, name })` shares `list`'s resolution — extracted into `sessionSkillCatalog(sessionId)`, which yields the layered registry (the live agent's scoped `skills` service, else the host registry), the project `cwd` from the session header, and the presenter scope — then calls `registry.get(name, { cwd, scope })` and projects `{ description, whenToUse?, content }` from the returned `SkillDefinition`. An unattached session → `session-not-found`; a name absent from the catalog → `skill-not-found`. Like `list`, it never creates or resumes an Agent (the host-resident session header only). The Odoo sync now issues one session-addressed `skill.read` per listed skill, best-effort: a read failure keeps the list metadata and leaves `content` empty.

## Per-preset attribution (Odoo consumer)

The Odoo "Sync from Harness" first created only preset-less mirror rows, and `unique(skill_key)` meant the same key could not exist under two presets. The workspace-addressed enumeration fixes both. `npei.agent.skill` now scopes uniqueness per `(preset_id, skill_key)` — enforced in Python (`_check_skill_key_unique_per_preset`) so a NULL preset counts as a value, with a migration dropping the legacy `unique(skill_key)` SQL constraint. `action_sync_from_harness` runs two passes: for each preset with a resolvable workspace it calls `skill.listWorkspace` and upserts rows carrying that `preset_id` (body via workspace-addressed `skill.read`), then a global mirror pass over the most-recent session's `skill.list` fills preset-less rows for names no preset owns (skipping attributed names, using session-addressed `skill.read`). The per-preset pass is deterministic; the mirror pass is best-effort and skipped when no session is mapped.

## File format

The writer emits each frontmatter scalar as a JSON-quoted string (YAML ⊃ JSON, so a JSON double-quoted string is a valid YAML flow scalar), which keeps multi-line or special-character descriptions safe. The reader accepts JSON double-quoted, single-quoted, and plain scalars so it can also read files authored by hand or by the skill toolchain. `assembleSkillFile` → `parseSkillFile` round-trips any body that does not itself begin with a newline (the writer's single `\n\n` separator newline is stripped on read).

## Not model-visible

These are administrative RPCs invisible to any model request, so no session event, snapshot, or SDK transcript changes. The frontend `RpcMethodMap` mirrors the host method vocabulary (the SPA never calls them, like `workspace.*` writes it never issues) so the shared list stays exact.

## Acceptance criteria

- `skill.write` then `skill.read` round-trips `description`, `whenToUse`, and `content`; the on-disk file carries the assembled frontmatter.
- `workspace-not-found`, `skill-invalid-name` (including traversal attempts), `skill-not-found`, `skill-too-large`, and containment-escape `forbidden` each map to their wire code.
- A ticket or anonymous principal is refused with `forbidden` through the fetch carrier for all three methods.
- A session-addressed `skill.read` returns the resolved catalog skill's `{ description, whenToUse?, content }`; an unattached session → `session-not-found`, an absent name → `skill-not-found`.
- The Odoo sync fills each mirror row's `content` from the session-addressed read and keeps list metadata when the read is unavailable.
- `skill.listWorkspace` returns a workspace's authored skills sorted by name with `modelInvocable: true`; an empty skills directory yields `[]`, an unknown workspace `workspace-not-found`, and a ticket/anonymous caller `forbidden`.
- The Odoo sync attributes each workspace-listed skill to its preset (`preset_id` set), lets the same `skill_key` exist under different presets, and blocks a duplicate within one preset (or the mirror scope).
