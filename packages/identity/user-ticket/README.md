# @deepseek-ai/dsh-user-ticket

English

Short-lived per-user signed ticket for the Odoo-fronted harness deployment. Odoo authenticates a user and mints a ticket; the browser calls the harness `/api` directly carrying it as `Authorization: Bearer <ticket>`; the harness only **verifies** the signature and expiry and resolves the caller to an `ApiPrincipal`. Refresh is Odoo's job — this package mints nothing at runtime and exposes no refresh endpoint.

## Ticket format

`v1.<b64url(payload)>.<b64url(HMAC_SHA256)>`, where `payload = {"u":<userId>,"exp":<unixSeconds>}` and the MAC is computed over the ASCII string `"v1." + b64url(payload)`. The scheme carries **no algorithm field**, so algorithm-confusion and `alg:none` attacks are impossible by construction: `verifyTicket` only ever computes HMAC-SHA256. The MAC is compared in constant time over equal-length digests.

## API

- `verifyTicket(token, prepared, nowSeconds?)` → `{ ok: true, userId }` or `{ ok: false, reason: 'expired' | 'invalid' }`. Authenticity is checked first; `expired` means an authentic ticket past `exp` (client should re-mint through Odoo); `invalid` means a bad signature, a malformed token, or an `exp` beyond the max-TTL guard (re-minting will not help).
- `prepareTicketAuth(config)` validates the `auth.ticket` block once at load. An absent block or an empty secret leaves ticket auth **disabled** (returns undefined); a present-but-short secret or an out-of-range lifetime guard fails loud.
- `signTicket(claims, secret)` defines the wire format from the signing side. The canonical minter is Odoo (Python); this function is the format's second home for TypeScript fixtures and tests.
- `UserId` brands the per-user id; `ApiPrincipal` is `{ kind: 'token' }` or `{ kind: 'ticket', userId }`.

## Lifetime guards

`exp` is honored with a fixed clock-skew tolerance (default 30 s) absorbing Odoo/harness drift. A ticket whose `exp` sits further ahead than the max TTL (default 900 s) is rejected as `invalid` — the harness never mints such a ticket, so an authentic one that far in the future is a mis-mint.

## Composition

This package is a pure library, not a Cordis plugin. `dsh-client-connection` consumes `prepareTicketAuth`/`verifyTicket` inside its `/api` auth fence; `dsh-host-apiproxy` consumes `ApiPrincipal`/`UserId` for per-user filtering. Its invariant companion is intentionally empty because the package owns no service, event stream, or mutable relation — verification is a total function of its inputs.

## Model Experience

None. Tickets are transport credentials; no ticket value or user id reaches a model request, prompt, or model-visible content.

#### KV Cache effect

None; this package touches neither tokens nor the model-visible prefix.

## Known Limitations and Deferred Work

- **Verify-only** — the harness never mints or refreshes tickets; a different origin between the SPA and the harness would require a separate, deliberate CORS decision outside this package.
- **Single shared secret** — no key rotation / `kid` selection yet; rotating the secret invalidates every outstanding ticket at once.
- **Second minter for tests only** — `signTicket` exists to define the format symmetrically and sign fixtures; production minting lives in Odoo.
