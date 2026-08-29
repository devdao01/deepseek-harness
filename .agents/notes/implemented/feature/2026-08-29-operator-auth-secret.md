# Agent Note: Server-to-server operator authentication for /api

Status: implemented

English | [Tiếng Việt](2026-08-29-operator-auth-secret.vi.md)

## Problem

The 0.1.2 `/api` gate (`packages/client/connection/src/rpc-host.ts` `requestRejection`) admits a request only when it passes the Host/Origin trust fence AND is either browser-authenticated (dsh-auth cookie) OR carries a resolved request principal (a `dsh_ticket` → `{ userId }`). Odoo is the operator — a server-to-server caller with no browser session and no per-user ticket. It used to send `Authorization: Bearer <token>` (an rc.7 scheme 0.1.2 ignores), so after the fence it got 401. The launch token rotates per restart, so it cannot be Odoo's stable credential.

The operator must stay **principal-less**: the operator-gated controllers (`sessionAccess.set/get` in `packages/session/session-access/src/controller.ts`) gate on `requestPrincipal.current() === undefined`, so admitting Odoo as a principal would break access management.

## Decision

Add a stable shared **operator secret** that admits a principal-less caller. It replaces only the 401 auth step; the Host/Origin fence (403) still applies first, and the operator never gets a principal.

Two seams, mirroring the existing ticket resolver:

1. **Connection service** (`packages/client/connection/src/operator-auth.ts`): a new optional `OperatorAuth { verify(request): boolean }`, declaration-merged onto `Context` and read through `ctx.get('operatorAuth')` — exactly like `requestPrincipalResolver`. In the `/api` handler (`src/index.ts`) the admission expression becomes:

   ```ts
   const principal = ctx.get('requestPrincipalResolver')?.resolve(req)
   const operator = principal === undefined && ctx.get('operatorAuth')?.verify(req) === true
   const rejection = connection.requestRejection(req, principal !== undefined || operator)
   ```

   The operator path leaves `requestPrincipal.run(principal, …)` with the **undefined** principal, so the operator stays principal-less. `requestRejection` itself is unchanged (it already takes a `hasPrincipal` boolean).

2. **Operator provider plugin** (`packages/identity/user-ticket/src/operator.ts`, new `@deepseek-ai/dsh-user-ticket/operator` export): schemastery `Config { secret?: string; header?: string = 'x-dsh-operator' }`. Empty/absent secret ⇒ does NOT provide `operatorAuth` (operator auth off). Else provides an `operatorAuth` whose `verify` reads the configured header and compares it to the secret with `crypto.timingSafeEqual` over equal-length buffers (length guarded first, since `timingSafeEqual` throws on unequal lengths).

The secret travels in a request **header** `x-dsh-operator`, never a cookie: a browser cannot set it cross-origin, and the fence already blocks cross-origin requests.

The MTIL overlay (`apps/cli/config/examples/mtil/cordis.yml`) mounts `@deepseek-ai/dsh-user-ticket/operator` with `config.secret: !!js process.env.DSH_OPERATOR_SECRET ?? ''`; unset ⇒ not mounted, single-tenant behavior unchanged.

## Odoo side

The Odoo module (`apps/npei_agent_harness`) sends `X-DSH-Operator: <secret>` read from a new `ir.config_parameter` `npei_agent_harness.operator_secret` (surfaced as the "Operator Secret" field in Settings). `harness_client._auth_headers` adds the header via a new `_operator_headers` helper; the two proxy paths in `controllers/main.py` (`rpc_proxy`, `download_proxy`) send it too. The legacy `Authorization: Bearer` header is kept alongside it — harmless against 0.1.2 (ignored), still honored by an rc.7 harness.

## Consequences

- A deployment with `DSH_OPERATOR_SECRET` unset mounts no `operatorAuth`, so the surface is byte-for-byte the pre-change behavior; the secret is safe to leave configured only where Odoo needs it.
- The operator secret and the ticket secret are independent: tickets identify per-user browser callers; the operator secret admits the principal-less management plane. Both share the same trust fence.

## Verification

- `npx tsc -b packages/client/connection/tsconfig.host.json packages/identity/user-ticket/tsconfig.json` — clean.
- `npx vitest run packages/client/connection packages/identity/user-ticket` — 155 tests pass, including 11 new: the connection seam (operator secret admits principal-less → status 200 with no principal; 401 on wrong/absent header; 403 when the Host fence fails regardless of the header; 401 when no `operatorAuth` mounted) and the operator plugin (empty secret ⇒ unmounted; timing-safe match/mismatch/wrong-length/custom-header).
- `npx tsx scripts/cordis-config-files.ts` (verify-cordis-config) — passes.
- `python -m py_compile` on the three edited Odoo files — clean.
- Deferred to a running harness: that the assembled MTIL composition resolves `operatorAuth` on the host plane and that a live Odoo→harness call with the header is admitted end to end.
