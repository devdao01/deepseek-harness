# MTIL fork map

Every place this fork (`main`, base `fb2c4b9e` = `dsh-v0.1.5-rc.2`) diverges from upstream DeepSeek Harness, grouped by how much an upstream merge will hurt. Use it as the checklist when syncing: resolve group 3 by hand first, groups 1–2 mostly self-merge. Keep this file current — a fork change that touches a new upstream file adds a row here in the same PR.

MTIL-only conventions: the deployment is Odoo 17 (module `apps/npei_agent_harness`) + this harness on one Ubuntu host + the standalone SPA (`apps/frontend` submodule) served by nginx under `/mtilai2/`. Per-user identity arrives as the HMAC `mtil-ticket` cookie minted by Odoo; `u='*'` is the management wildcard.

## Group 1 — never conflicts (fork-owned trees)

| Path | What it is |
|---|---|
| `apps/frontend/` (submodule, repo `devdao01/frontend-deepseek-harness`) | The MTIL SPA: Odoo login gate, `__MTIL_UI__` flags, SPA-private client plugins (`public/mtil-*.js`: router, welcome, brand, i18n, model picker, upload button, DOM rebrand), deploy overlay + build script |
| `apps/npei_agent_harness/` | Odoo module: session ACL mirror, preset authoring (standalone/router/Odoo connection), provider sign-in wizard, tool/model mirrors, `i18n/vi_VN.po` + `tools/regenerate_i18n.py` |
| `apps/odoo-mcp/` | Dependency-free MCP stdio server for per-preset Odoo XML-RPC access (read set + `ODOO_ALLOW_WRITE` write set, `ODOO_TOOL_PREFIX` rebrand) |
| `apps/nginx.conf` | Two-frontend nginx deployment (SPA alias + harness proxy) |
| `~/.dsh/profiles/web/cordis.patch.yml` (server, from `apps/frontend/deploy/harness-web-lan.patch.yml`) | Deployment overlay: trustedHosts, `ticketSecret`, `presetWorkspaceRoot`, optional fixed `launchToken` |

## Group 2 — light conflicts (additive code in upstream files)

New methods/blocks appended to files upstream also evolves; git usually auto-merges, review the few overlaps.

| Area | Files | Fork content | Key commits |
|---|---|---|---|
| Workspace file download | `packages/client/ui-chat/src/client/apply.ts` | Under `__MTIL_UI__.downloadFiles`, `openFile` downloads through upstream's `workspaceFiles.readAll` instead of opening a Sidebar preview. The fork's own `session/readWorkspaceFile` retired at the 0.1.5 rebase, as did the upload counterpart at 0.1.3 (upstream ships `dsh-client-file-upload`) | `2537206a` (retired) |
| Provider sign-in bridge | `packages/api/settings-controller/src/{authorization,index,types}.ts` | `AuthorizationBridge` + 5 Remote methods (`listAuthorizations`…`cancelAuthorization`) driving interactive OAuth (ChatGPT) over poll/respond; same-key takeover | `3bdf4504`, `0a3ca3af` |
| Preset management surface | `packages/preset/agent-presets/src/*` | `@Remote` rename/setActive/author/writeRaw/toolCatalog; structured composition generator (persona, bash/web, router departments, `odoo` MCP row with host-resolved server path); `active` roster flag; events `agent-preset/authored`/`renamed` | `6f331edf`, `c1679b49`, `0dd69152`, `4ca51296` |
| Fixed launch token | `packages/client/connection/src/{index,browser-auth}.ts` | `launchToken` config pinning the `/?token=` URL across restarts | `b34fbfa7` |
| Authorization mount | `packages/bundle/base/cordis.patch.yml` + `package.json` | Mounts `@deepseek-ai/dsh-authorization` beside the credential store so pi-ai login flows register | `aaa46b52` |
| Boot payload for the SPA | `packages/bundle/web-app/src/index.ts`, `packages/client/{hmr,modules,connection}` client halves | `GET /api/boot.payload` index-injection table; transports resolve against optional `__DSH_APP_BASE__` | `4dca74e4`, `f3f18c06` |

## Group 3 — real conflicts (behavioral edits to upstream code); resolve by hand first

These change what existing upstream code does; a plugin cannot express them, and upstream refactors land on top of them.

| Area | Files | Fork behavior | Key commits |
|---|---|---|---|
| Upstream expectations the fork moves | `packages/api/session-controller/tests/session-projections.host.spec.ts`, `packages/client/ui-sidebar/tests/__snapshots__/` | The access gate's await lets the attachment service register, so the `imageLimits` projection is present where upstream sees it absent; the sidebar snapshot carries the fork's `sidebar.header.actions` slot | `cf49ffe1` |
| Multi-tenant session access | `packages/api/session-controller/src/{access,index,list,commands}.ts` | `session_access` storage domain (allowedUsers per session); `session/list`/`search` filtered by the ticket user; every session-addressed entry point calls `assertViewerMayRead`; empty allowed set = public; `*` manages but never owns; `session/setAccess` is wildcard-only; preset workspaces (`presetWorkspaceRoot`, reconcile, retitle) | `1bdbf820`, `ed2d4ffe`, `b68e94d7`, `d6e8bab1`, `c2ec7873` |
| Caller identity on the wire | `packages/client/connection/src/{rpc-request-context,user-ticket,rpc-host}.ts`, `packages/api/gateway/src/stream-server.ts` | AsyncLocalStorage carries request headers into Remote methods; canonical `mtil-ticket` verify; WebSocket upgrade binds headers so streams see the same identity as unary calls | `1bdbf820`, `8d711091` |
| `/api/file` off under tickets | `packages/api/session-controller/src/index.ts` | `/api/file` names no Session and cannot be gated, so a ticketed deployment does not mount it at all; the Session-addressed `workspaceFiles` Remotes serve file content instead. `workspaceFiles` is unchanged from upstream and takes no `ticketSecret`: only `session-controller` opens the `session_access` domain, because `storage-domain` refuses a second open of one name at boot (`DomainError: domain 'session_access' is already open`) | 0.1.5 rebase |
| 0.1.3 gate classifications | `scripts/verify-application-entrypoints.ts`, `scripts/gen-cordis-catalog.ts`, `scripts/translation-pairing.ts`, generated `docs/` catalog artifacts | Fork executables allowlisted (`apps/odoo-mcp/server.mjs`, the two `apps/multi-agent-setup` scripts); eleven management-plane payload types exempted from catalog type links; fork-internal documentation (`docs/MTIL-FORK.md`, `apps/odoo-mcp`, `apps/multi-agent-setup`, `apps/npei_agent_harness`, two Agent Notes) excluded from the bilingual corpus | `cf49ffe1` |
| Shipped preset display copy | `packages/preset/agent-presets/presets/standard/preset.yml` | `name`/`description` carry the English copy verbatim from `presetStandardName`/`presetStandardDescription` (`packages/client/ui-agent-preset/src/client/locales.ts`) instead of upstream's Chinese. Raw roster metadata is what every non-localized consumer renders — the Odoo mirror (`npei.agent.preset`) and Host surfaces — while `presetDisplayText` still routes client UI through those same locale keys, so only the fallback changes and both paths now read alike. **On merge, keep the English copy**, and re-copy it when upstream edits either locale value: resolving in upstream's favour silently restores Chinese in the Odoo backend, and no test reads the shipped file, so nothing fails to warn you. The `cordis`, `minimal`, and `ptc` presets keep their upstream Chinese copy | rc.2 merge |
| MTIL UI flags in stock client packages | `packages/client/ui-workspace/src/client/{tree,rows/*}.ts(x)`, `ui-conversation/locales.ts`, `ui-chat/apply.ts`, `ui-sidebar/*`, `ui-model-selection`, `ui-agent-preset/settings-store.ts` | `__MTIL_UI__` gates: titled blank sessions listed, hero headline override, download-not-open for files, sidebar header-actions slot, custom model picker seat, deactivated presets withheld from pickers | `b643e9ad`, `aa2293a9`, `2537206a`, `84d60d72`, `178ba61b` |

## Upstream sync procedure

1. `git fetch upstream && git merge upstream/<tag>` on a throwaway branch.
2. Resolve group 3 files first with this map open; the intent column says what must survive.
3. `pnpm run build && pnpm run test` (fork-critical suites: `session-controller`, `agent-presets`, `settings-controller`, `connection`), then a live boot with the production overlay and one `session/list` + ticket smoke.
4. Rebuild the SPA (`apps/frontend/deploy/build-mtil.sh`) only if client packages moved.
5. Update this file: new touchpoints in, healed ones out.
