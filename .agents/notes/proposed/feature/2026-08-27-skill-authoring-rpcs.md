# Agent Note: Skill authoring RPCs — workspace-addressed skill file management

Status: proposed

English

## Problem

`SkillsApi` served only `skill.list`: a read-only, session-addressed catalog lookup. An operator front (the Odoo/MTIL deployment layer) needs to author skill files — create, read, and delete the content of one skill — without a live session. The operator already holds a workspace id (presets provision a conventional workspace), so the natural address is `(workspaceId, name)`, not a session id.

## Capability

Three unary RPCs extend the skills domain, each operating on `<workspace.path>/.agents/skills/<name>/SKILL.md`:

- `skill.read({ workspaceId, name }) → { description, whenToUse?, content }` — reads and splits the file: frontmatter → `description`/`whenToUse`, body → `content`. Missing file → `skill-not-found`.
- `skill.write({ workspaceId, name, description, whenToUse?, content }) → { name }` — assembles a YAML frontmatter block (`name`, `description`, and `whenToUse` when present) + `\n\n` + body, creates the directory when absent, overwrites.
- `skill.remove({ workspaceId, name }) → { removed }` — removes the skill directory; idempotent (`removed: false` when absent).

Each resolves the workspace from `ctx.workspaceRegistry.get(workspaceId)` (absent → `workspace-not-found`) and never creates or resumes an Agent — authoring is pure filesystem I/O over the workspace's canonical path. The format helpers and containment/I/O live in `packages/host/apiproxy/src/skill-authoring.ts`; `api-proxy.ts` only resolves the workspace and maps typed failures onto wire codes.

## Security decisions

- **Full-token-only.** All three are added to `FULL_TOKEN_ONLY` in `fetch/handler.ts`, alongside `workspace.*` mutation: skill authoring is deployment administration the operator front owns. A per-user ticket or anonymous caller is refused with `forbidden` before the payload is parsed. A ticket still lists a session's catalog through `skill.list`.
- **Name safety.** `name` must be a single, non-traversing skill segment: `isSkillName` (`@deepseek-ai/dsh-skill`) plus an explicit rejection of `/`, `\`, `.`, and `..`. Invalid → `skill-invalid-name`. The explicit checks keep the path-safety guarantee independent of the `isSkillName` regex.
- **Containment.** The `realpath` of the skill directory must sit beneath the `realpath` of `<workspace.path>/.agents/skills/`, the same pattern `workspace.file` uses, so a symlink planted inside the workspace cannot redirect a write or read outside it. An escape → `forbidden`.
- **Size bound.** The body is capped at a fixed 64 KiB (`SKILL_CONTENT_MAX_BYTES`), a security invariant like `EXECUTABLE_EXTENSIONS` — never deployment config — so authoring cannot become an unbounded host-write channel. Oversize → `skill-too-large`.
- **Only `SKILL.md`.** The write target is always the fixed `SKILL.md` basename under the validated skill directory; no caller-supplied path segment reaches the filesystem.

## File format

The writer emits each frontmatter scalar as a JSON-quoted string (YAML ⊃ JSON, so a JSON double-quoted string is a valid YAML flow scalar), which keeps multi-line or special-character descriptions safe. The reader accepts JSON double-quoted, single-quoted, and plain scalars so it can also read files authored by hand or by the skill toolchain. `assembleSkillFile` → `parseSkillFile` round-trips any body that does not itself begin with a newline (the writer's single `\n\n` separator newline is stripped on read).

## Not model-visible

These are administrative RPCs invisible to any model request, so no session event, snapshot, or SDK transcript changes. The frontend `RpcMethodMap` mirrors the host method vocabulary (the SPA never calls them, like `workspace.*` writes it never issues) so the shared list stays exact.

## Acceptance criteria

- `skill.write` then `skill.read` round-trips `description`, `whenToUse`, and `content`; the on-disk file carries the assembled frontmatter.
- `workspace-not-found`, `skill-invalid-name` (including traversal attempts), `skill-not-found`, `skill-too-large`, and containment-escape `forbidden` each map to their wire code.
- A ticket or anonymous principal is refused with `forbidden` through the fetch carrier for all three methods.
