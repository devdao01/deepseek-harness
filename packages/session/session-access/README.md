# @deepseek-ai/dsh-session-access

English

Durable per-session access-control list for the Odoo-fronted harness: which users may see and act on each session. It is a capability seam — `SessionAccessService` is both the Definition and its single durable Provider; the Consumer is `dsh-host-apiproxy`, which gates unary calls and filters event-stream frames through `canRead`.

## Fail-closed model

`canRead(principal, sessionId)` is the single enforcement predicate:

- A **full token** (Odoo/admin management plane, or loopback) always passes.
- A **ticket** (per-user) caller passes only when their `userId` is an explicit member of the session's access set.
- A session with **no access record** grants ticket callers nothing — absence denies. Management `set` is the only way a session becomes visible to a ticket user.

## API

- `get(sessionId)` → `ReadonlySet<UserId>` — the current allowed users (a fresh copy; empty for an unknown session).
- `set(sessionId, userIds)` — replace the set; an empty set removes the row (revoke all), a non-empty set stores the deduplicated ids. Persists, then emits `domain/changed`.
- `canRead(principal, sessionId)` — the fail-closed gate above.
- `onChanged(listener)` — fires with a session id after each durable write, so an open stream can re-evaluate access for a live grant or revoke. Returns a disposer.

## Durability and versioning

State lives in its own `session_access` storage domain (one `access` table keyed by session id), **not the session log**: per-user access is host access-control metadata, never model-visible content. It therefore does **not** affect `SESSION_FORMAT_VERSION`. The current set is reconstructed by reloading the domain on open; every write lands as a `domain/changed` event.

## Composition

Requires `storageDomain`. Default-export the service class; mount it beside the API proxy. Its invariant companion is intentionally empty: the service keeps no derived cache (reads resolve straight from the domain table), and the domain's own record/write integrity is asserted by `storage-domain`.

## Model Experience

None, as the access list is host authorization metadata whose entries never reach a model request, prompt, or model-visible content.

#### KV Cache effect

None; this package touches neither tokens nor the model-visible prefix.

## Known Limitations and Deferred Work

- **Whole-set replacement only** — `set` replaces the entire allowed-user set; there is no incremental add/remove verb yet.
- **Grant-mid-stream reopen** — a live **revoke** takes effect immediately through the per-frame `canRead` gate; a live **grant** becomes visible to an open stream on its next reopen (the `onChanged` live-grant re-baseline is a deferred upgrade).
- **No cascade to subsessions** — access is per session id; a parent grant does not implicitly grant its subagent children.
