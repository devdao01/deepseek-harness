---
description: "Ambient unary-RPC request context and signed user-ticket verification, shared by every Host consumer that resolves a caller identity."
kind: "package-reference"
---

# @deepseek-ai/dsh-user-ticket

## Summary

`dsh-user-ticket` answers one question for a Host Remote method: who is calling? The Host carrier drops the Fetch `Request` before the gateway invokes a method, so this package keeps the caller-derived slice of the in-flight unary RPC in an `AsyncLocalStorage` and verifies the signed ticket its Cookie header carries. It owns no policy: what that caller may read belongs to the service holding the access records.

This MTIL fork package lets consumers as different as the Session Controller, the preset roster, and the workspace-file service read one caller identity without depending on the browser transport that installs it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Installing the context

Only a Host carrier does this, once per unary RPC dispatch. `dsh-client-connection` already wraps its `/api` handler, and `dsh-api-gateway` binds the same context around a WebSocket upgrade so a stream sees the identity its unary calls see:

```ts
import { runWithRpcRequest } from '@deepseek-ai/dsh-user-ticket'

declare const request: Request
declare const dispatch: (payload: unknown) => Promise<unknown>
declare const payload: unknown

const result = await runWithRpcRequest({ headers: request.headers }, () => dispatch(payload))
```

### Reading the caller

A Remote method reads the ticket user id with the deployment's shared secret:

```ts
import { currentTicketUserId } from '@deepseek-ai/dsh-user-ticket'

declare const config: { ticketSecret?: string }

const viewer = currentTicketUserId(config.ticketSecret)
```

`undefined` means anonymous, and it is the only correct reading of absence: outside a unary dispatch — tests, workers, direct service calls — no context is installed. `'*'` is the management wildcard the deployment's identity provider mints for its own server-side plane; it administers other users' records but owns nothing itself.

<a id="understand-the-implementation"></a>
## Understand the implementation

A ticket is `v1.<base64url {"u","exp"}>.<base64url mac>`, signed with HMAC-SHA256 over the deployment secret and compared with `timingSafeEqual`. Verification refuses an unknown version, a malformed segment, a wrong signature, and an expired `exp`; every refusal returns `undefined` rather than throwing, because a caller who presents a bad ticket is exactly as anonymous as one who presents none.

The public exports live in [`src/index.ts`](src/index.ts): the context in [`src/rpc-request-context.ts`](src/rpc-request-context.ts), the ticket in [`src/user-ticket.ts`](src/user-ticket.ts).

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

These limits define where the package is not the right tool. They are current package constraints, not a task backlog.

- **Verification is stateless** — `exp` is the only bound on a ticket's life, so a leaked ticket stays valid until it expires and this package offers no way to reject one earlier. Revocation needs a store, which belongs to the identity provider that mints tickets.
- **One secret, one version** — `verifyUserTicket` compares against a single HMAC over a single `v1` format. There is no dual-secret acceptance window, so rotating the deployment secret invalidates every live ticket at once and every browser re-enters through the identity provider's gate.

<a id="dev-note"></a>
## Dev Note

The secret is a deployment secret, never a per-user one: anyone holding it can mint any identity, including the wildcard. It reaches the harness through plugin config and belongs with the deployment's other credentials.
