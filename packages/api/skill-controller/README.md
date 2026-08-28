---
description: "Host Remote owner for workspace-addressed skill file authoring: list, read, write, and remove one workspace's SKILL.md files without a live session."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-skill-controller

## Summary

The session-addressed skill catalog (`ctx.remote.skills.list`) answers "what can this session invoke". This package is its workspace-addressed counterpart: `ctx.remote.skillAuthoring` lets an operator holding a workspace id enumerate the skills authored in that workspace's `.agents/skills` directory and read, write, or remove their `SKILL.md` files, with no live session and no Agent. The Odoo/MTIL front uses it to attribute skills to the preset that owns each workspace and to edit skill content from outside the harness.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the default export as a Host row; it registers the `skillAuthoring` Remote namespace. Its methods all take a `workspaceId` the caller resolved from the workspace registry:

- `listWorkspace({ workspaceId })` → the authored skills (name, description, optional whenToUse, `modelInvocable: true`), sorted by name; an absent skills directory returns `[]`.
- `read({ workspaceId, name })` → one file's `{ description, whenToUse?, content }`.
- `write({ workspaceId, name, description, whenToUse?, content })` → the written name; creates the directory when absent and overwrites.
- `remove({ workspaceId, name })` → `{ removed }`; idempotent.

An unknown workspace fails `workspace-not-found`; an invalid or traversing name `skill-invalid-name`; a missing file `skill-not-found`; a body over 64 KiB `skill-too-large`; a symlink escaping the workspace skills directory `forbidden`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/skill-authoring.ts` is the pure filesystem layer: `assembleSkillFile`/`parseSkillFile` serialize a YAML-frontmatter-plus-body file; `listWorkspaceSkills`/`readSkill`/`writeSkill`/`removeSkill` operate one skill directory. The containment rule is the security core — the skill directory is `realpath`-canonicalized and must sit beneath the canonical `<workspace>/.agents/skills`, so a planted symlink cannot redirect a read or write outside it — and `name` is validated to a single non-traversing segment. The body is capped at a fixed 64 KiB (`SKILL_CONTENT_MAX_BYTES`), a security bound and never deployment config.

`src/index.ts` is the `SkillAuthoringController` Remote service: it resolves the workspace path from `ctx.workspaceRegistry`, calls the filesystem layer, and maps the typed `SkillAuthoringError` codes onto `TypertRemoteFailure`. No method creates or resumes an Agent.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The `skillAuthoring` Remote service |
| [`src/skill-authoring.ts`](src/skill-authoring.ts) | Pure format, containment, and filesystem helpers |
| [`src/types.ts`](src/types.ts) | Wire request and value types |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion: no runtime invariant |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-api-session-controller](../session-controller/README.md) — the session-addressed skill catalog (`ctx.remote.skills.list`).
- [dsh-skill](../../skill/skill/README.md) — the skill registry and discovery model.
- [dsh-workspace](../../workspace/workspace/README.md) — the workspace registry these methods address.

-----

<a id="model-experience"></a>
## Model Experience

No model-facing surface. These are operator RPCs invisible to any model request: they read and write workspace files and never enter a prompt, tool schema, or session log.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

A session-addressed read (the body a session's merged catalog would load, for a skill discovered outside any authored workspace) is not yet exposed here; the session-addressed `ctx.remote.skills.list` carries no body.

-----

<a id="dev-note"></a>
## Dev Note

The filesystem layer is transport-agnostic and covered by `tests/skill-authoring.spec.ts` over a real temp workspace; the Remote wiring is exercised by the assembled-composition suite.
