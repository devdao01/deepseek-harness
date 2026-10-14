# Agent Note: Per-session allowed-users records and signed user tickets

Status: implemented

## Problem

The MTIL deployment fronts one harness with an Odoo login: each Odoo user must see only the sessions that belong to them (plus unrestricted ones), Odoo must be able to assign a session's allowed users, and the harness must learn which user a browser RPC comes from — without trusting a client-writable value and without changing the on-disk session format of a live deployment.

## Decision

- **Access records live in a new `session_access` storage domain**, not in the session header (a header field is a structural change that bumps `SESSION_FORMAT_VERSION` and rejects every existing log) and not as a session event (every `SessionEventMap` member is required-on-read, so older builds would refuse whole logs). The record follows the projection-cache pattern: per-record layout, bound to the log identity (`createdAt`, `cwd`) so a recreated session id never inherits an unrelated record. Absent or empty record = unrestricted; that makes every pre-feature session visible to everyone, which is the intended legacy semantics.
- **Caller identity is a signed ticket, not a raw user id**: the `mtil-ticket` cookie carries `v1.<base64url {"u","exp"}>.<base64url HMAC-SHA256>` minted by Odoo over the shared `ticketSecret` (`dsh-api-session-controller` config). A raw `user_id` cookie would let any browser impersonate any user with DevTools. No secret, no cookie, bad signature, or expired all read as anonymous.
- **The unary RPC carrier publishes the request through AsyncLocalStorage** (`runWithRpcRequest`/`currentRpcRequest`, owned by `dsh-user-ticket` and re-exported by `dsh-client-connection`): the Fetch `Request` used to end at the dispatch call, and widening every `ConnectionRpcHandler`/gateway signature for one consumer would spread transport vocabulary through the invocation chain. Absence of the ambient context must always read as the anonymous caller, so tests and non-HTTP entry points are unchanged.
- **`u: "*"` is the management wildcard**: the Odoo module — the trusted management plane holding the same shared secret server-side — presents it on every wire call to see all sessions (rows carrying their `allowedUsers`) and administer access lists; Odoo enforces its own per-user ACL on its side. Browsers never receive a wildcard ticket, and forging one requires the secret.
- **Enforcement covers list/search AND every session-addressed entry point** (page, follow, prompt, rename, fork, selectModel, attachment, updateQueue, cancel): a caller the record does not name gets the same `session-not-found` an unknown id gets, so a restricted id neither opens by deep link nor leaks its existence. `session/create` tags an identified creator into an absent record (never replacing an existing one; the `*` wildcard is NOT an owner — it creates on behalf of others, and no pushed list means deliberately public). `session/setAccess` replaces the record whole (empty deletes it) and — once a `ticketSecret` is configured — accepts only the `*` wildcard, because an ordinary browser could otherwise grant itself access. The `dsh-auth` browser cookie still owns transport auth; this layer scopes per-user visibility. Streams need two extra moves: the WebSocket mux binds each upgrade request's headers around every stream open (message events dispatch outside any HTTP scope, so the identity would otherwise read as anonymous — prompt over unary passed while history over `follow` failed for the session's own creator), and `follow` starts its gate at CALL time because iteration happens later in the carrier's serve loop. Known remaining surface: the `$events` forwarded-event stream broadcasts live session events to every connected authenticated client without per-session access filtering.

## Alternatives considered

**Keep the allowed-users list in the session header.** A header field is a structural format change: it bumps `SESSION_FORMAT_VERSION`, and a live deployment's existing logs are then refused by the builds that read them.

**Record access as a session event.** Every `SessionEventMap` member is required-on-read, so any build that does not know the event refuses the whole log rather than skipping the line.

**Send a raw `user_id` cookie.** Any browser sets that from DevTools and becomes any user. Signing the id with the deployment secret makes impersonation require the secret instead of a text editor.

**Widen `ConnectionRpcHandler` and the gateway signatures to pass the Fetch `Request`.** One consumer would push transport vocabulary through the whole invocation chain. The ambient context keeps that knowledge in the carrier that already has it, and its absence reads as anonymous, so tests and non-HTTP entry points need no change.

**Let an ordinary ticket call `session/setAccess`.** A browser holding a valid user ticket could then grant itself any session. Once a `ticketSecret` is configured the call takes the `*` wildcard only, so access lists are written from the management plane.

**Gate visibility in `session/list` alone.** Listing is the discoverable surface, but a restricted id would still open by deep link. Every session-addressed entry point answers `session-not-found`, so a restricted session neither opens nor confirms that it exists.

## Consequences

Per-user visibility arrives without touching the on-disk session format: every pre-feature log stays readable, and an absent or empty record reads as unrestricted, which is the legacy semantics a running deployment needs.

The cost is that identity now rests on one deployment-wide secret. Anyone holding it mints any identity including the wildcard, and rotating it invalidates every live ticket at once ([`dsh-user-ticket`](../../../../packages/util/user-ticket/README.md) records both limits).

Enforcement is a discipline rather than a structural guarantee: it lives at each session-addressed entry point, so a new entry point that forgets `assertViewerMayRead` is open by default. Streams needed two extra moves for the same reason — the WebSocket mux binds the upgrade request's headers around every stream open, and `follow` gates at call time because iteration happens later in the carrier's serve loop.

Two surfaces stay outside the gate. `/api/file` names no Session and cannot be gated, so a ticketed deployment does not mount it and serves file content through the Session-addressed `workspaceFiles` Remotes instead. The `$events` forwarded-event stream still broadcasts live session events to every authenticated client without per-session filtering.
