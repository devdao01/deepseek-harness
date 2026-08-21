# `@deepseek-ai/dsh-web-app`

English | [中文](README.zh.md)

The dsh browser-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md): it sets the coding persona, inserts the Web host rows (webserver, API gateway, workspace, projection cache, storage) and the browser plugin roster, the always-on client-plugin reload chain ([`dsh-client-hmr`](../../client/hmr/README.md), idle until a rebuild watcher rewrites client bundles), and mounts this package's `web-runtime` glue plugin (config `{printUrl, surfaceContext, trustedHosts, apiTokenFile}`). That plugin resolves the built frontend dist through `@deepseek-ai/dsh-web-frontend`'s exports, samples bind-dependent LAN trust once, resolves the deployment's API token (see below), provides them as `webRuntime` to the browser-trust fence and client roster, mounts the [`frontend-static`](../../host/frontend-static/README.md) fallback owner, registers the harness-source and web-surface prompt sections plus the bash-visible `DSH_WEB_URL` runtime variable when `surfaceContext` is true, and prints the `dsh web:` URL line when `printUrl` is true, after its Loader tree settles so a sibling failure cannot announce a dead app. This bundle also owns the app command line: the ordinary `web-startup` provider ([`src/startup.ts`](src/startup.ts)) injects `ctx.cmdlineArgs` ([`dsh-cmdline`](../../boot/cmdline/README.md)), parses `--host`, `--port`, repeatable `--trusted-host`, and the app's `--help`, then provides `webStartup`. It rejects `--host 0.0.0.0` before publishing that service because the CLI intentionally does not support all-interfaces binding yet. Flag-configured rows inject the service and read it directly from lazy config, so nothing binds a port before argument resolution and `dsh --profile web --help` starts no server. [`dsh-headless`](../headless/README.md) is a sibling surface over the same base and does not mount this bundle.

## Mandatory API authentication

The web deployment always boots with Bearer-token authentication active on `/api`, so a server client (an Odoo backend, for example) can authenticate out of the box while the same-origin SPA and loopback curl keep working token-less. The `web-runtime` row resolves the token ([`src/api-token.ts`](src/api-token.ts), `apiTokenFile: !!js dshHomePath('api-token')`) in this order: the `DSH_API_TOKEN` environment variable when set (validated ≥16 characters, an operator override that is never persisted); else a token persisted by a previous boot at `$DSH_HOME/api-token` (default `~/.dsh/api-token`); else a freshly generated 32-byte hex token, persisted atomically at mode 0600 and logged once by file path (`dsh web: no API token found; generated one at <path> — read it with: cat <path>` — the value is never logged). A persisted file that exists but is unreadable or malformed (empty/too short) fails the boot rather than silently regenerating over an operator's file; wrong permissions on an otherwise-readable file are left as they are. The resolved token is published on `webRuntime.apiToken`, which the `connection` row wires into its `auth.tokens`; the deployment's `unpinned` list grants authenticated clients the four `agentPreset.*` authoring methods. Rotate by deleting the token file (a fresh one is generated on the next boot) or by setting `DSH_API_TOKEN` to a new value. The generic auth mechanism and its fence semantics are documented in [`dsh-client-connection`](../../client/connection/README.md); only this bundle makes it mandatory.

## Model Experience

### Harness-source and Web-surface context

#### What the model sees

When `surfaceContext` is true, the `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:web-surface` global section (order −98) orients the model to the GUI: the canonical local URL, the "this page" referent, the update contract (the reload receiver is always on; no-refresh reloads additionally need the `pnpm run dev:web` watcher), and the instruction not to start replacement servers. `DSH_WEB_URL` additionally appears in the managed bash environment with its description, resolved per invocation from the live server. When it is false, neither section nor the variable is registered.

#### Token effect

One source line and one prompt paragraph per session plus two managed-environment variable lines; constant per process.

#### KV Cache effect

The prompt section sits near the system prompt's head and is stable for the life of the process (the port is a boot fact), so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **The frontend dist must be built** — `require.resolve` of the dist fails loud at activation with a build hint; there is no source-serving fallback.
- **`lanAddresses` is a boot-time snapshot** — interface changes after boot are not re-advertised; the printed LAN URL always matches the configured trust fence.
