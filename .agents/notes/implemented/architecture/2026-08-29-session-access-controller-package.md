# Agent Note: Extract SessionAccessController into its own package

Status: implemented

English | [Tiếng Việt](2026-08-29-session-access-controller-package.vi.md)

## Problem

`packages/session/session-access` bundled two things: the base `SessionAccessService` (its index default export) and a `SessionAccessController extends TypertRemoteService` in `src/controller.ts` (exported via `./controller`). The Typert workspace generator binds a package's generated `lib/typert.host.js` descriptor to the `@Remote` class reachable as the package's **index default export**. Because session-access's index default is the base service, no descriptor was generated for the controller, so `ctx.remote.sessionAccess.set/get` never registered. That Remote is the multi-tenant ACL admin control-plane the operator (Odoo/MTIL) uses to grant per-session access, so it must work.

## Decision

Split the controller into its own controller package, mirroring the proven `packages/api/skill-controller` template, so its index default export is the `@Remote` service and the generator emits its descriptor.

- New package `@deepseek-ai/dsh-api-session-access-controller` at `packages/session/session-access-controller`. `src/index.ts` default-exports `SessionAccessController` (behavior identical: the `@Remote` `set`/`get`, `TypertRemoteFailure` mapping, and the `requestPrincipal.current() === undefined` operator gate are unchanged). `src/types.ts` holds the wire request/value types; `src/invariant.ts` is the explained empty companion. Exports mirror skill-controller: `.`/`./invariant`/`./types`/`./typert`/`./remote`/`./src/*`/`./package.json`. `dependencies: { zod }`; the workspace packages it imports are peer + dev deps. No local tsdown config — the root typert plugin generates `typert.host.js` because `./typert` is exported.
- `packages/session/session-access` loses its dead `./controller` export and `src/controller.ts` (pre-release: no compat shim). Its `.`/`./invariant`/`./visibility` exports are untouched.
- The mtil overlay's `session-access-controller` row repoints `name` from `@deepseek-ai/dsh-session-access/controller` to `@deepseek-ai/dsh-api-session-access-controller` (still mounted). The new package is added to `apps/cli` **dependencies** (verify-cordis-config requires it there, not devDeps).
- Registered in `tsconfig.base.json` (index/invariant/types path mappings; the dead `session-access/controller` mapping removed) and `tsconfig.host.json` (reference).

## Consequences

`build:lib:host` now emits `packages/session/session-access-controller/lib/typert.host.js` with the `sessionAccess` namespace `set`/`get` invocations, so the descriptor registers and the operator can grant per-session access. session-access still builds and keeps `lib/types/visibility.js`.

## Verification

- `pnpm run build:lib:host` → new package's `lib/typert.host.js` exists (binds `sessionAccess` set/get); session-access's `lib/types/visibility.js` still present.
- `npx tsc -b packages/session/session-access-controller/tsconfig.json` clean.
- `npx vitest run packages/session/session-access-controller packages/session/session-access` → 20 passed (the controller operator-gate spec moved with the code).
- `npx tsx scripts/cordis-config-files.ts` (verify-cordis-config) passes.

## Deferred

The full suite, hygiene (knip/publint), and doc-site sync were not run in this work order; CI owns them.
