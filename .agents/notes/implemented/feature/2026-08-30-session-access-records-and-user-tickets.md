# Agent Note: Per-session allowed-users records and signed user tickets

Status: implemented

## Problem

The MTIL deployment fronts one harness with an Odoo login: each Odoo user must see only the sessions that belong to them (plus unrestricted ones), Odoo must be able to assign a session's allowed users, and the harness must learn which user a browser RPC comes from — without trusting a client-writable value and without changing the on-disk session format of a live deployment.

## Decision

- **Access records live in a new `session_access` storage domain**, not in the session header (a header field is a structural change that bumps `SESSION_FORMAT_VERSION` and rejects every existing log) and not as a session event (every `SessionEventMap` member is required-on-read, so older builds would refuse whole logs). The record follows the projection-cache pattern: per-record layout, bound to the log identity (`createdAt`, `cwd`) so a recreated session id never inherits an unrelated record. Absent or empty record = unrestricted; that makes every pre-feature session visible to everyone, which is the intended legacy semantics.
- **Caller identity is a signed ticket, not a raw user id**: the `mtil-ticket` cookie carries `v1.<base64url {"u","exp"}>.<base64url HMAC-SHA256>` minted by Odoo over the shared `ticketSecret` (`dsh-api-session-controller` config). A raw `user_id` cookie would let any browser impersonate any user with DevTools. No secret, no cookie, bad signature, or expired all read as anonymous.
- **The unary RPC carrier publishes the request through AsyncLocalStorage** (`runWithRpcRequest`/`currentRpcRequest` in `dsh-client-connection`): the Fetch `Request` used to end at the dispatch call, and widening every `ConnectionRpcHandler`/gateway signature for one consumer would spread transport vocabulary through the invocation chain. Absence of the ambient context must always read as the anonymous caller, so tests and non-HTTP entry points are unchanged.
- **Enforcement is at list/search only** (`session/list`, `session/search`); `session/create` tags an identified creator into an absent record (never replacing an existing one), and `session/setAccess` replaces the record whole (empty deletes it). Direct reads by session id (history, prompt) are not filtered — the deployment's harness auth still owns real access control; this layer scopes what each signed-in user is shown.
