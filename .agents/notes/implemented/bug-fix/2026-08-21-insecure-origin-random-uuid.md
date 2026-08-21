# Agent Note: crypto.randomUUID is secure-context-only in the browser client layer

Status: implemented

English | [中文](2026-08-21-insecure-origin-random-uuid.zh.md)

## Problem

The stock web UI opened from a plain-HTTP LAN origin (`http://192.168.60.16:3080`) looped `[web-runtime] connection lost, retry #N` forever. Root cause: `AbstractApiClient.mintRpcId` (`packages/host/apiproxy/src/fetch/client.ts`) called `crypto.randomUUID()`. Browsers expose `crypto.randomUUID` ONLY in a secure context (HTTPS or `localhost`); on an insecure origin it is `undefined`, so the call threw synchronously — before any fetch — inside the connection generation's readiness handshake. The catch aborted the generation, which closed both WebSockets while they were still `CONNECTING` ("WebSocket is closed before the connection is established"), and the controller retried forever. Verified in a real browser on that origin: `isSecureContext:false`, `typeof crypto.randomUUID === 'undefined'`, `getRandomValues` available; the raw WS to the same URL worked (streams mint their rpcIds host-side, never in the browser). The old comment — "crypto.randomUUID is a Web API (browser + Node ≥19): keeps this base platform-neutral" — was wrong: it is not neutral across browser *origins*.

## Decision

`mintRpcId` now uses a `getRandomValues`-based helper, `randomUuid()`, which carries no secure-context requirement and works on every origin (and in Node ≥19, whose global `crypto` exposes the same Web Crypto surface). It is used unconditionally rather than branching on `crypto.randomUUID?.()`, because the capability varies by origin, not by platform, so a branch would leave the insecure path essentially untested where it matters.

**Canonical home.** The one implementation lives in `packages/llm/llm/src/random-uuid.ts`, exported from the `@deepseek-ai/dsh-llm/random-uuid` subpath. `dsh-llm` is INLINE_SAFE shared vocabulary whose `message.ts` already mints browser-side `MessageId`s, and every consumer either is `dsh-llm` or may depend on it — the constraint that fixes the home, since a browser-inlined importer's own dependency must be INLINE_SAFE and `dsh-brand` (the only other zero-runtime candidate) is contractually type-only. `packages/host/apiproxy/src/fetch/random-uuid.ts` is now a thin re-export from that subpath (apiproxy depends on `dsh-llm`, never the reverse), keeping the `@deepseek-ai/dsh-host-apiproxy/client` surface — `mintRpcId` and the client layers importing from it — pointed at the single implementation.

The previously-duplicated copy in `packages/client/connection/src/client/random-uuid.ts` is deleted; its importers (`client/rpc.ts`, `client/fixture.ts`) import the apiproxy `/client` re-export, leaving one implementation. The browser-reachable sweep found two other secure-context-only uses, both routed through the same helper: `llm/message.ts`'s `createMessage` (the `createUserMessage` family, `MessageId(crypto.randomUUID())` — INLINE_SAFE, so it lands verbatim in browser bundles; latent because no current browser flow mints a Message but any future one would crash on a plain-HTTP LAN origin), fixed in place with the local import; and `ui-conversation`'s `browserDraftAttachment` (`crypto.randomUUID()` for a draft-attachment id), which gained an `@deepseek-ai/dsh-host-apiproxy` dependency to reach the `/client` re-export. Node-side `node:crypto` `randomUUID` uses (`api-proxy.ts`, `fetch/handler.ts`, the WS downlink) and the non-INLINE_SAFE host-only uses (`anonymous-user-id`'s injectable default, `dsh-commands`' instance token) run only in Node, whose global `crypto.randomUUID` has no secure-context restriction, and are left as-is.

## Alternatives considered

**Prefer `crypto.randomUUID?.()` when present, fall back to the helper.** Rejected: the native call adds nothing on the origins where it works, and the branch's insecure arm is the one that matters yet is the harder to keep exercised. One unconditional path is simpler and provably origin-independent.

**A `randomUUID` polyfill assigned onto `globalThis.crypto`.** Rejected: mutating a global Web API surface to patch one call site is a broader, spookier change than a local helper, and it would mask the same trap for any future secure-context-only API.

**Keep the helper in `dsh-client-connection` and have apiproxy import it.** Rejected by dependency direction: `dsh-client-connection` depends on `dsh-host-apiproxy`, not the reverse.

**Put the canonical helper in `dsh-brand` or a new `packages/util/*` package.** Rejected: a browser-inlined module's own import must be INLINE_SAFE (`host-apiproxy|session|llm|tools|brand`), and a new util package would force widening that gate for every client bundle; `dsh-brand` is the only other zero-runtime INLINE_SAFE member but is contractually type-only (no runtime code). `dsh-llm` is INLINE_SAFE, already mints browser-side ids, and is depended on (never depended-from) by the other consumers — the durable single home.

**Keep the implementation in apiproxy and have llm import it.** Rejected by the same direction rule: `dsh-host-apiproxy` depends on `dsh-llm`, so llm cannot import from apiproxy; the implementation goes to llm and apiproxy re-exports.

## Consequences

The web UI boots and stays connected on plain-HTTP LAN origins, and neither image-attach nor a future browser-side Message mint throws there. There is one browser-safe UUID helper, `@deepseek-ai/dsh-llm/random-uuid`, re-exported through `@deepseek-ai/dsh-host-apiproxy/client`; `llm/random-uuid.ts` is per-file 100% covered, its unit test pins the insecure-context path (stubbed `crypto` with only `getRandomValues`), and a `mintRpcId` test proves a unary call still mints a valid rpcId with `randomUUID` absent. The broader lesson, worth guarding against: **secure-context-only Web APIs** (`crypto.randomUUID`, `crypto.subtle`, others) are traps in the browser client layer — they pass every localhost/HTTPS test and fail only on a plain-HTTP LAN origin, exactly the deployment the token/LAN work targets. New browser-reachable code mints ids and hashes through origin-independent primitives (`getRandomValues`) or the shared helper, never `crypto.randomUUID`. Node-side `node:crypto` is unaffected. No wire, format, or session-event change.
