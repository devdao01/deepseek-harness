# MTIL fork map

Every place this fork diverges from upstream DeepSeek Harness, grouped by how much an upstream merge will hurt. The `dev` branch carries the fork on base `dsh-v0.2.0-rc.2`; `main` keeps the previous generation on base `dsh-v0.1.5-rc.2`. Use this file as the checklist when syncing: resolve group 3 by hand first, groups 1–2 mostly self-merge. Keep it current — a fork change that touches a new upstream file adds a row here in the same PR.

MTIL-only conventions: the deployment is one or more companies' Odoo 17 (module `apps/npei_agent_harness`) + one harness instance per company on one Ubuntu host + the standalone SPA (`apps/frontend` submodule) served by nginx under `<company Odoo domain>/mtilai2/`. Per-user identity arrives as the HMAC `mtil-ticket` cookie minted by Odoo; `u='*'` is the management wildcard. Installation and topology (per-company instances bound to loopback behind a same-host nginx, a TLS gateway that admits `/mtilai2/` only for an MTIL User of that Odoo): [MTIL-DEPLOY.md](MTIL-DEPLOY.md).

Upstream-file rule: a fork change keeps upstream lines verbatim and adds the smallest hook. Logic lives in fork-owned files — a fork package, or a `mtil-*.ts` module inside the upstream package it extends — and the upstream file only imports and calls it.

## Port status on `dsh-v0.2.0-rc.2`

| Feature | Status |
|---|---|
| Fork-owned trees (group 1), user tickets, multi-tenant session access, `/api/file` off under tickets, fixed launch token, boot payload, provider sign-in bridge, MTIL UI flags, Odoo-owned lifecycle gates | Ported |
| Preset management (`copy`, `author`, `writeRaw`, `rename`, `deletePreset`, `setActive`, `toolCatalog`, `trust`/`active` roster) | Re-implemented as `@deepseek-ai/dsh-mtil-presets` over the upstream registry's `register()`; Remote namespace `mtilPresets` (was `agentPresets`); `copy` and `rename` take one `request` object because Typert refuses optional Remote parameters |
| Sub-path transports (`__DSH_APP_BASE__` patches in gateway, connection, HMR) | Healed upstream: transports resolve against `document.baseURI`; the SPA pins its `<base>` to the app base |
| Authorization mount in `packages/bundle/base` | Healed upstream |
| English copy in shipped `preset.yml` files | Obsolete: shipped presets publish no `name` (see group 3) |
| SPA filter of deactivated presets | Not needed: the SPA hides the preset picker; Odoo archives a deactivated preset |

## Group 1 — never conflicts (fork-owned trees)

| Path | What it is |
|---|---|
| `apps/frontend/` (submodule, repo `devdao01/frontend-deepseek-harness`) | The MTIL SPA: Odoo login gate, `__MTIL_UI__` flags, SPA-private client plugins (`public/mtil-*.js`), deploy overlay `deploy/harness-web-lan.patch.yml` + build script. A pnpm workspace member through `apps/*` |
| `apps/npei_agent_harness/` | Odoo module: session ACL mirror, preset authoring over `mtilPresets/*`, provider sign-in wizard, tool/model mirrors, the SPA login gate `POST /api/mtil/get_config_v2` (mints the `mtil-ticket` cookie) and the gateway's `GET /api/mtil/auth_check`, `i18n/vi_VN.po` + `tools/regenerate_i18n.py` |
| `apps/odoo-mcp/` | Dependency-free MCP stdio server for per-preset Odoo XML-RPC access |
| `apps/multi-agent-setup/` | Department preset sources and their build scripts |
| `apps/mtil-deploy/` | Per-company deployment: `add-company.sh`, the `mtil-harness@.service` template, nginx for the gateway (`gateway.conf`, `mtil-spa.locations` with the Odoo `auth_request`) and for the harness host (`harness-host.conf`, Host → instance port maps) |
| `packages/util/user-ticket/` | `@deepseek-ai/dsh-user-ticket`: AsyncLocalStorage request context and `mtil-ticket` verification |
| `packages/preset/mtil-presets/` | `@deepseek-ai/dsh-mtil-presets`: stored presets in `$DSH_HOME/.agent-presets` (the directory earlier fork releases used, so existing presets load unchanged) declared through `ctx.agentPresets.register()` |
| `packages/client/ui-{workspace,sidebar,chat}/src/client/mtil-*.ts`, `packages/client/ui-conversation/src/client/skeleton/mtil-ui.ts` | Fork modules holding the `__MTIL_UI__` logic the upstream files call |
| `/srv/mtil/<company>/.dsh/profiles/web/cordis.patch.yml` (server, rendered by `add-company.sh` from `apps/frontend/deploy/harness-web-lan.patch.yml`) | Per-instance overlay: fixed `launchToken`, session-controller `ticketSecret`/`presetWorkspaceRoot`, the `mtil-presets` row (`ticketSecret`, `odooMcpServer`); the stock loopback bind is kept |

## Group 2 — light conflicts (additive code in upstream files)

| Area | Files | Fork content |
|---|---|---|
| Provider sign-in bridge | `packages/api/settings-controller/src/{authorization,index,types}.ts`, README pair | `AuthorizationBridge` + 5 Remote methods (`listAuthorizations`…`cancelAuthorization`) driving interactive OAuth over poll/respond |
| Fixed launch token | `packages/client/connection/src/{index,browser-auth}.ts` | `launchToken` config pinning the `/?token=` URL across restarts |
| Boot payload for the SPA | `packages/bundle/web-app/src/index.ts` | `GET /api/boot.payload` index-injection table, registered as an effect |
| Fork package registration | `packages/bundle/web-app/package.json`, `tsconfig.base.json`, `tsconfig.host.json`, `python/sdk-runtime/package.json` | `dsh-mtil-presets` resolvable from the web profile; both fork packages in the TS paths and Host aggregate; `dsh-user-ticket` in the Python runtime closure |
| No-Session navigation | `packages/client/ui-workspace/src/client/navigation.ts` | `UiWorkspace.clearSession()` for the sidebar's `brandClearsSession` |
| Gate classifications | `scripts/{verify-application-entrypoints,gen-cordis-catalog,gen-doc-graphs,translation-pairing,gen-third-party-notices,verify-package-readme-model-experience,package-dependency-policy,check-workspace-constraints}.ts`, `.oxlintrc.json` | Fork executables allowlisted; MTIL payload types exempted from catalog type links; `mtilPresets` mapped to `core.md` and classified; fork documentation outside the bilingual corpus; `dsh-user-ticket` exports peer-required; `apps/frontend` outside workspace constraints and lint |

## Group 3 — real conflicts (behavioral edits to upstream code); resolve by hand first

| Area | Files | Fork behavior |
|---|---|---|
| Upstream expectations the fork moves | `packages/api/session-controller/tests/{session-projections,subagent-catalog}.host.spec.ts`, `packages/client/ui-sidebar/tests/__snapshots__/` | The access gate's await lets the attachment service register, so `imageLimits` is present where upstream sees it absent; the sidebar snapshots carry the `sidebar.header.actions` slot |
| Multi-tenant session access | `packages/api/session-controller/src/{access,index,list,commands}.ts` | `session_access` storage domain; `session/list`/`search` filtered through `mayView` (empty list = public, `*` sees all); every session-addressed Remote calls `assertViewerMayRead` (`projections` answers `null` for a hidden Session); `session/setAccess` is wildcard-only; preset workspaces (`presetWorkspaceRoot`, ensure on create, one-shot reconcile) |
| Caller identity on the wire | `packages/client/connection/src/rpc-host.ts`, `packages/api/gateway/src/stream-server.ts` | Unary handlers and the per-upgrade stream opener run inside `runWithRpcRequest` |
| `/api/file` off under tickets | `packages/api/session-controller/src/index.ts` | A ticketed deployment does not mount `SessionMediaReferences`; the Session-addressed `workspaceFiles` Remotes serve file content instead |
| Shipped preset display copy | `packages/bundle/web-app/presets/*.patch.yml` | Nothing to carry: shipped rows publish no `name`, and `isBuiltInPreset` relies on that for locale routing. **Do not add `name` to these rows** |
| MTIL UI flags in stock client packages | `packages/client/ui-workspace/src/client/{tree.ts,rows/Rows.tsx,rows/WorkspaceBrowser.tsx}`, `ui-conversation/src/client/{locales.ts,skeleton/ConversationContent.tsx}`, `ui-chat/src/client/apply.ts`, `ui-sidebar/src/client/{SidebarRoot.tsx,contract/slots.ts,index.ts,locales.ts}`, `ui-model-selection/src/client/index.ts` | `ui-workspace`, `ui-sidebar`, `ui-chat`, and the Conversation skeleton call their `mtil-*.ts` module; `ui-conversation/locales.ts` and `ui-model-selection` read the flag inline. Behaviors: titled blank sessions listed (`placeholderBlank`), hero headline override, file download (`mtilDownloadFile` over `workspaceFiles.readBytes`), sidebar header-actions slot and brand exit, custom model picker seat, hidden Add-workspace button, and the lifecycle withholdings below. Wrapped JSX is re-indented for the lint rule; `git diff -w` shows the real change |
| Odoo owns Session and Workspace lifecycle | `packages/client/ui-workspace/src/client/rows/Rows.tsx`, `packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx`, `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | `hideNewSession` withholds the sidebar and per-row new-session buttons, the hero's Workspace chip row, and — with nothing selected — the composer; `hideWorkspaceActions` withholds the Workspace row menu, `hideSessionActions` the Session row's slot-driven menu and its title double-click rename. The composer survives on a selected blank Session (`skeleton.client.spec.tsx` → `MTIL blank Session: the composer survives so the first prompt can be typed`). **These gates are affordances, never authority, by decision** (2026-09-18): `session/create` still answers any valid ticket, and a self-made Session is visible only to its creator under `session_access`, so a wildcard check on create would buy no confidentiality. **On merge, keep every gate and re-apply it to whatever replaces these rows**; the signal is `ui-workspace/tests/rows.client.spec.tsx` → `withholds both row menus under the MTIL lifecycle flags` |

## Upstream sync procedure

1. Reset a throwaway branch to the new upstream tag and re-apply the fork, or `git merge` the tag into it.
2. Resolve group 3 files first with this map open; the behavior column says what must survive.
3. Regenerate the catalogs (`gen-cordis-catalog`, `gen-client-catalog`, `gen-config-catalog`, `gen-persistence-catalog`, `gen-doc-graphs`, `gen-plugin-packages`), then `pnpm run typecheck && pnpm run lint`, the fork-critical suites (`session-controller`, `settings-controller`, `connection`, `gateway`, `mtil-presets`, `user-ticket`, `ui-workspace`, `ui-sidebar`, `ui-conversation`), and a live boot with the production overlay plus one `session/list` and `mtilPresets/list` smoke.
4. Rebuild the SPA (`apps/frontend/deploy/build-mtil.sh`) only if client packages moved.
5. Update this file: new touchpoints in, healed ones out.
