---
description: "Operator Remote owner for per-session access grants: read and replace one session's allowed-user set, gated to the operator, so the Odoo/MTIL front can share a session with ticket users."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-session-access-controller

## Summary

This package owns the operator `sessionAccess` Remote namespace: `ctx.remote.sessionAccess.set/get` lets the operator (the Odoo/MTIL management plane, a principal-less caller) read and replace one session's allowed-user set. Management writes are the only way a session becomes visible to a ticket user — the durable list is fail-closed. Its index default export is the `@Remote` service, so the Typert workspace generator binds this package's `lib/typert.host.js` descriptor to it and the namespace registers. The durable access-list service it drives lives in [`@deepseek-ai/dsh-session-access`](../session-access/README.md).

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

Mount the default export as a Host row; it registers the `sessionAccess` Remote namespace. Both methods are operator-gated — a ticket caller (one whose request resolved a principal) is refused `forbidden`:

- `set({ sessionId, userIds })` → the stored allowed-user set after the write; an empty `userIds` revokes all ticket access.
- `get({ sessionId })` → the current allowed-user set.

A single-tenant deployment (no ticket principal) treats every admitted caller as the operator.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/index.ts` is the `SessionAccessController` Remote service: it resolves the principal from `ctx.requestPrincipal`, refuses a ticket caller, and reads or writes the durable list through `ctx.sessionAccess`. `src/types.ts` holds the wire request and value types, free of runtime code so the generated Remote client imports them.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The `sessionAccess` Remote service (default export) |
| [`src/types.ts`](src/types.ts) | Wire request and value types |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion: no runtime invariant |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-session-access](../session-access/README.md) — the durable per-session access list this Remote drives.
- [dsh-api-skill-controller](../../api/skill-controller/README.md) — the workspace-addressed skill authoring Remote, the same controller-package pattern.

-----

<a id="model-experience"></a>
## Model Experience

No model-facing surface. These are operator RPCs invisible to any model request: they read and write host access-control metadata and never enter a prompt, tool schema, or session log.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

None tracked.

-----

<a id="dev-note"></a>
## Dev Note

The operator gate and set/get round-trip are covered by `tests/controller.spec.ts` over a real storage/domain access-list composition; the Remote wiring is exercised by the assembled-composition suite.
