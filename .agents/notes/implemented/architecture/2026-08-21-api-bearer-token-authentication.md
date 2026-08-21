# Agent Note: Bearer-token authentication for the /api surface

Status: implemented

English | [中文](2026-08-21-api-bearer-token-authentication.zh.md)

## Problem

The /api carrier ([api-request-trust](../../../packages/client/connection/src/api-request-trust.ts)) has always been a reachability fence, not authentication: a request is accepted when its Host is loopback or a declared `trustedHosts` authority and its browser CSRF markers are same-origin, and a privileged subset ([the browser-trust boundary note](2026-07-28-api-browser-trust-boundary.md)) is pinned to loopback. That is exactly right for the same-origin SPA, but it leaves no way to let a specific *server* client — the deployment's own Odoo backend, driving the harness over the API from another machine — reach the surface, or to grant it a controlled slice of the loopback-pinned methods. The trust fence deliberately "is not an auth layer", so the whole configuration plane stayed loopback-local for want of one. The user decided to add that layer: Bearer tokens, with a config-driven list of pins authenticated clients may call.

## Decision

An opt-in `auth` config on the connection plugin layers Bearer-token authentication ON TOP of the reachability fence, in a new gated module [api-auth](../../../packages/client/connection/src/api-auth.ts). Default is exactly today's behavior: with no tokens configured, `prepareApiAuth` returns undefined and every path runs unchanged.

**Authentication.** `authenticateApiRequest(headers, prepared)` reads `Authorization: Bearer <token>` (scheme case-insensitive) and classifies it `authenticated` / `invalid` / `absent`. The compare is constant-time over SHA-256 digests (fixed 32-byte `timingSafeEqual` inputs) and checks every configured token without an early return, so neither a token's value nor its position leaks through timing. The token `name` is for logs and rotation only, never an identity the API trusts.

**What a token grants — and does not.** The decision the carrier applies is `reachable = isTrustedApiRequest(request, trustedHosts) || (authenticated && !requestHasBrowserMarker(request))`. A valid token bypasses ONLY the Host reachability check, and only for a request that carries no browser marker (no `Origin`, no `sec-fetch-site`): a marked request always goes through the full fence, so the same-origin SPA is unchanged and a stolen token cannot be replayed cross-site from a page. A present-but-unknown token is `401` on HTTP channels (rejected on WS), never a silent downgrade to reachability. For the loopback pins, an authenticated client may additionally call a method the deployment lists in `auth.unpinned`; a pin not listed stays loopback-only even for authenticated clients. The pinned SET is a fixed constant (`PRIVILEGED_METHODS`); `unpinned` only moves existing members into the authenticated-allowed group, and every entry must be a member or the load fails.

**Channels.** The decision is one shared closure applied at the HTTP `/api` route (unary POST, `/api/respond`, the GET downloads, the SSE-426 path) and at both WS upgrades. `http-bridge` forwards the `Authorization` header into the Fetch request, so the pin check re-reads it consistently. Browsers cannot set WebSocket request headers, so the SPA WS path stays same-origin loopback and token-less; server-side WS clients authenticate with the header.

**Config, fail-loud.** `auth: { tokens: [{ name, token }], unpinned: [<pinned method>, …] }`. `prepareApiAuth` throws at load on a token shorter than `MIN_API_TOKEN_LENGTH` (16; docs recommend ≥32 random characters) or an `unpinned` entry outside `PRIVILEGED_METHODS`. The code default for `unpinned` is empty; the deployment's initial choice — `agentPreset.read/copy/openDocument/remove` — lives in its cordis.yml overlay, not the code. The token is supplied through the environment (`token: !!js process.env.DSH_API_TOKEN`).

## Alternatives considered

**HMAC-signed requests (shared secret, per-request signature).** Rejected for this step: it defends replay and tampering a bearer token does not, but every client (an Odoo module first) would need to implement canonical-request signing, and the transport is already loopback/LAN TLS-terminable. A bearer token is the lowest-friction credential a server client can send, and Postman/any HTTP client supports it natively. HMAC remains a future option if replay protection becomes a requirement.

**mTLS (client certificates).** Rejected now: strong, but it moves trust into certificate issuance and the webserver's TLS configuration, which this plugin does not own, and it is heavyweight to provision for a single Odoo integration. It stays the right answer if the deployment already runs a PKI.

**OIDC / bearer JWTs from an identity provider.** Rejected as premature: this is a single-tenant local/LAN service with no user directory. A JWT would add signature verification, key rotation, and clock handling for no multi-user benefit yet. The `tokens[].name` field leaves room to grow toward per-client identities without changing the wire.

**Splitting `isTrustedApiRequest` into host-reachable and markers-ok halves and composing `markersOk && (host || authenticated)`.** Rejected for a smaller-surface equivalent: the `!requestHasBrowserMarker` bypass keeps the existing fence untouched (no re-coverage of its host/marker branches) and yields the same guarantee — a browser-marked request is never granted by a token. A server client sending stray marker headers would be held to the Host fence, which is the safe direction.

**Enforcing the token inside `isTrustedApiRequest` itself.** Rejected to keep that module a pure reachability policy (its own note calls it "not an auth layer"); authentication is a separate, separately-tested concern layered by the carrier.

## Consequences

A deployment can now expose the API to a named server client with a token while the browser SPA keeps working token-less, and can hand that client a controlled subset of the otherwise loopback-only methods. The reachability fence and its ADR are unchanged; this note owns the auth layer above it. The gated logic lives in `api-auth.ts` (100% per-file covered); the wiring is in the coverage-excluded `index.ts` and is exercised by the node-half integration specs (valid token passes from an untrusted Host, unknown token 401, listed pin allowed, unlisted pin refused, unauthenticated pins unchanged, browser-marked request never bypassed, WS reject/accept, load-time failures). Listing `settings.*` or `credentials.*` in `unpinned` exposes configuration and API-key material to any token holder — documented as the deployment's explicit risk. No session event and nothing model-visible, so no snapshot fixture or format-version bump. Rotation is additive: list the new token beside the old, migrate clients, drop the old; both authenticate while both are listed. A revoked token takes effect on the next config load. The `!!js process.env.DSH_API_TOKEN` overlay keeps the secret out of the committed cordis.yml.
