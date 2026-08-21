# Agent Note: crypto.randomUUID is secure-context-only in the browser client layer

Status: implemented

English | [中文](2026-08-21-insecure-origin-random-uuid.zh.md)

## Problem

The stock web UI opened from a plain-HTTP LAN origin (`http://192.168.60.16:3080`) looped `[web-runtime] connection lost, retry #N` forever. Root cause: `AbstractApiClient.mintRpcId` (`packages/host/apiproxy/src/fetch/client.ts`) called `crypto.randomUUID()`. Browsers expose `crypto.randomUUID` ONLY in a secure context (HTTPS or `localhost`); on an insecure origin it is `undefined`, so the call threw synchronously — before any fetch — inside the connection generation's readiness handshake. The catch aborted the generation, which closed both WebSockets while they were still `CONNECTING` ("WebSocket is closed before the connection is established"), and the controller retried forever. Verified in a real browser on that origin: `isSecureContext:false`, `typeof crypto.randomUUID === 'undefined'`, `getRandomValues` available; the raw WS to the same URL worked (streams mint their rpcIds host-side, never in the browser). The old comment — "crypto.randomUUID is a Web API (browser + Node ≥19): keeps this base platform-neutral" — was wrong: it is not neutral across browser *origins*.

## Decision

`mintRpcId` now uses a `getRandomValues`-based helper, `randomUuid()`, which carries no secure-context requirement and works on every origin (and in Node ≥19, whose global `crypto` exposes the same Web Crypto surface). The helper is canonical and lives in the apiproxy browser-safe client layer: `packages/host/apiproxy/src/fetch/random-uuid.ts`, re-exported from `fetch/client.ts` so it reaches the `@deepseek-ai/dsh-host-apiproxy/client` subpath (INLINE_SAFE for client bundles). `mintRpcId` uses it unconditionally rather than branching on `crypto.randomUUID?.()`, because the capability varies by origin, not by platform, so a branch would leave the insecure path essentially untested where it matters.

The previously-duplicated copy in `packages/client/connection/src/client/random-uuid.ts` is deleted; its importers (`client/rpc.ts`, `client/fixture.ts`) now import the apiproxy export, leaving one implementation. A sweep of browser-reachable code found one other secure-context-only use — `ui-conversation`'s `browserDraftAttachment` (`crypto.randomUUID()` for a draft-attachment id) — now routed through the same helper (`ui-conversation` gained an `@deepseek-ai/dsh-host-apiproxy` dependency). Node-side `node:crypto` `randomUUID` uses (`api-proxy.ts`, `fetch/handler.ts`, the WS downlink) are host-only and left as-is.

## Alternatives considered

**Prefer `crypto.randomUUID?.()` when present, fall back to the helper.** Rejected: the native call adds nothing on the origins where it works, and the branch's insecure arm is the one that matters yet is the harder to keep exercised. One unconditional path is simpler and provably origin-independent.

**A `randomUUID` polyfill assigned onto `globalThis.crypto`.** Rejected: mutating a global Web API surface to patch one call site is a broader, spookier change than a local helper, and it would mask the same trap for any future secure-context-only API.

**Keep the helper in `dsh-client-connection` and have apiproxy import it.** Rejected by dependency direction: `dsh-client-connection` depends on `dsh-host-apiproxy`, not the reverse, so the canonical browser-safe minting helper belongs in the apiproxy client layer where `mintRpcId` lives.

## Consequences

The web UI boots and stays connected on plain-HTTP LAN origins, and image-attach no longer throws there. There is one browser-safe UUID helper, exported from `@deepseek-ai/dsh-host-apiproxy/client`; `random-uuid.ts` is per-file 100% covered and a `mintRpcId` test pins the insecure-context path (stubbed `crypto` with only `getRandomValues`). The broader lesson, worth guarding against: **secure-context-only Web APIs** (`crypto.randomUUID`, `crypto.subtle`, others) are traps in the browser client layer — they pass every localhost/HTTPS test and fail only on a plain-HTTP LAN origin, exactly the deployment the token/LAN work targets. New browser-reachable code mints ids and hashes through origin-independent primitives (`getRandomValues`) or the shared helper, never `crypto.randomUUID`. Node-side `node:crypto` is unaffected. No wire, format, or session-event change.
