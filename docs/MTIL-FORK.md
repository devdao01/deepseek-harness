# MTIL fork map

Every place this fork diverges from upstream DeepSeek Harness, grouped by how much an upstream merge will hurt. The `dev` branch carries the fork on base `dsh-v0.2.0-rc.2`; `main` keeps the previous generation on base `dsh-v0.1.5-rc.2`, and is the source for everything marked **deferred** below. Use this file as the checklist when syncing: resolve group 3 by hand first, groups 1–2 mostly self-merge. Keep it current — a fork change that touches a new upstream file adds a row here in the same PR.

MTIL-only conventions: the deployment is Odoo 17 (module `apps/npei_agent_harness`) + this harness on one Ubuntu host + the standalone SPA (`apps/frontend` submodule) served by nginx under `/mtilai2/`. Per-user identity arrives as the HMAC `mtil-ticket` cookie minted by Odoo; `u='*'` is the management wildcard.

## Port status on `dsh-v0.2.0-rc.2`

| Feature | Status |
|---|---|
| Fork-owned trees (group 1), user tickets, multi-tenant session access, `/api/file` off under tickets, fixed launch token, boot payload and sub-path transports, provider sign-in bridge, MTIL UI flags, Odoo-owned lifecycle gates | Ported |
| Authorization mount in `packages/bundle/base` | Healed upstream: the base bundle mounts `@deepseek-ai/dsh-authorization` itself |
| English copy in shipped `preset.yml` files | Obsolete upstream: shipped presets publish no `name`, so no Chinese reaches raw roster metadata (see group 3) |
| Preset management surface (`author`, `writeRaw`, `rename`, `setActive`, `toolCatalog`, `copy`, `deletePreset`, the `active` roster flag, `agent-preset/authored`/`renamed` events) and the SPA's deactivated-preset filter | **Deferred**: upstream replaced the directory-scanning `@deepseek-ai/dsh-agent-presets` with `@deepseek-ai/dsh-agent-preset-registry` + `@deepseek-ai/dsh-agent-preset` rows, whose Remote offers only `list`/`read`/`select`. The Odoo calls to the missing methods fail until this is re-designed on the registry's public `register(definition)` |

## Group 1 — never conflicts (fork-owned trees)

| Path | What it is |
|---|---|
| `apps/frontend/` (submodule, repo `devdao01/frontend-deepseek-harness`) | The MTIL SPA: Odoo login gate, `__MTIL_UI__` flags, SPA-private client plugins (`public/mtil-*.js`: router, welcome, brand, i18n, model picker, upload button, DOM rebrand), deploy overlay + build script. A pnpm workspace member through `apps/*` |
| `apps/npei_agent_harness/` | Odoo module: session ACL mirror, preset authoring (standalone/router/Odoo connection; its harness calls are deferred, see above), provider sign-in wizard, tool/model mirrors, `i18n/vi_VN.po` + `tools/regenerate_i18n.py` |
| `apps/odoo-mcp/` | Dependency-free MCP stdio server for per-preset Odoo XML-RPC access (read set + `ODOO_ALLOW_WRITE` write set, `ODOO_TOOL_PREFIX` rebrand) |
| `apps/multi-agent-setup/` | Department preset sources and their build scripts |
| `apps/nginx.conf` | Two-frontend nginx deployment (SPA alias + harness proxy) |
| `packages/util/user-ticket/` | `@deepseek-ai/dsh-user-ticket`: AsyncLocalStorage request context (`runWithRpcRequest`, `currentRpcRequest`) and canonical `mtil-ticket` verification (`verifyUserTicket`, `currentTicketUserId`) |
| `~/.dsh/profiles/web/cordis.patch.yml` (server, from `apps/frontend/deploy/harness-web-lan.patch.yml`) | Deployment overlay: trustedHosts, `ticketSecret`, `presetWorkspaceRoot`, optional fixed `launchToken` |

## Group 2 — light conflicts (additive code in upstream files)

New methods/blocks appended to files upstream also evolves; git usually auto-merges, review the few overlaps.

| Area | Files | Fork content |
|---|---|---|
| Workspace file download | `packages/client/ui-chat/src/client/apply.ts` | Under `__MTIL_UI__.downloadFiles`, `openFile` downloads the bytes from `workspaceFiles.readBytes` instead of opening a Sidebar preview |
| Provider sign-in bridge | `packages/api/settings-controller/src/{authorization,index,types}.ts`, README pair | `AuthorizationBridge` + 5 Remote methods (`listAuthorizations`…`cancelAuthorization`) driving interactive OAuth (ChatGPT) over poll/respond; same-key takeover |
| Fixed launch token | `packages/client/connection/src/{index,browser-auth}.ts` | `launchToken` config pinning the `/?token=` URL across restarts |
| Boot payload for the SPA | `packages/bundle/web-app/src/index.ts`; `packages/api/gateway/src/client/stream-client.ts`, `packages/client/connection/src/client/rpc.ts`, `packages/client/hmr/src/client/index.ts` | `GET /api/boot.payload` index-injection table. Upstream resolves its transports document-relative; an optional `__DSH_APP_BASE__` takes precedence because the SPA's document URL is a client route, not the app root |
| No-Session navigation | `packages/client/ui-workspace/src/client/navigation.ts` | `UiWorkspace.clearSession()` exposes the private `clearMain`, so the sidebar's `brandClearsSession` can return to the welcome panel |
| Lint scope | `.oxlintrc.json` | `apps/frontend/**` ignored: the submodule keeps its own toolchain |

## Group 3 — real conflicts (behavioral edits to upstream code); resolve by hand first

These change what existing upstream code does; a plugin cannot express them, and upstream refactors land on top of them.

| Area | Files | Fork behavior |
|---|---|---|
| Upstream expectations the fork moves | `packages/api/session-controller/tests/{session-projections,subagent-catalog}.host.spec.ts`, `packages/client/ui-sidebar/tests/__snapshots__/` | The access gate's await lets the attachment service register, so the `imageLimits` projection is present where upstream sees it absent; the sidebar snapshots carry the fork's `sidebar.header.actions` slot |
| Multi-tenant session access | `packages/api/session-controller/src/{access,index,list,commands}.ts` | `session_access` storage domain (allowedUsers per session); `session/list`/`search` filtered by the ticket user; every session-addressed entry point calls `assertViewerMayRead` (`projections` answers `null` for a hidden Session, like an unknown one); empty allowed set = public; `*` manages but never owns; `session/setAccess` is wildcard-only. Preset workspaces: `presetWorkspaceRoot` derives a create's cwd, groups it under a Workspace titled by the preset name, re-titles a lagging group on the next ensure, and `reconcilePresetWorkspaces` adopts stored sessions on the first list |
| Caller identity on the wire | `packages/client/connection/src/rpc-host.ts`, `packages/api/gateway/src/stream-server.ts` | Unary handlers and the per-upgrade stream opener run inside `runWithRpcRequest`, so streams see the same identity as unary calls |
| `/api/file` off under tickets | `packages/api/session-controller/src/index.ts` (route in `media-references.ts`) | `/api/file` names no Session and cannot be gated, so a ticketed deployment does not mount `SessionMediaReferences`; the Session-addressed `workspaceFiles` Remotes serve file content instead. Only `session-controller` opens the `session_access` domain, because `storage-domain` refuses a second open of one name at boot |
| Gate classifications | `scripts/verify-application-entrypoints.ts`, `scripts/gen-cordis-catalog.ts`, `scripts/translation-pairing.ts`, `scripts/gen-third-party-notices.ts`, `scripts/verify-package-readme-model-experience.ts`, generated `docs/` catalogs | Fork executables allowlisted (`apps/odoo-mcp/server.mjs`, the two `apps/multi-agent-setup` scripts); the session-access and sign-in payload types exempted from catalog type links; fork-internal documentation excluded from the bilingual corpus; `dsh-user-ticket` has no Model Experience section |
| Shipped preset display copy | `packages/bundle/web-app/presets/*.patch.yml` | Nothing to carry: shipped preset rows publish no `name`/`description`, and `isBuiltInPreset` relies on that to route client copy through the `preset<Id>Name` locale keys. The Odoo mirror (`npei.agent.preset`) shows the preset id for a nameless row. **Do not add `name` to these rows**: it disables the built-in locale routing in every client language |
| MTIL UI flags in stock client packages | `packages/client/ui-workspace/src/client/{tree.ts,rows/Rows.tsx,rows/WorkspaceBrowser.tsx}`, `packages/client/ui-conversation/src/client/{locales.ts,skeleton/ConversationContent.tsx}`, `packages/client/ui-chat/src/client/apply.ts`, `packages/client/ui-sidebar/src/client/{SidebarRoot.tsx,contract/slots.ts,index.ts}`, `packages/client/ui-model-selection/src/client/index.ts` | `__MTIL_UI__` gates, all set in `apps/frontend/src/main.ts` and absent on the harness-served original: titled blank sessions listed (`showTitledBlanks`, reading `SessionSummary.title`), hero headline override, download-not-open for files, sidebar header-actions slot and brand exit, custom model picker seat, hidden Add-workspace button, and the lifecycle withholdings below. The deactivated-preset filter in `ui-agent-preset/src/client/settings-store.ts` is deferred with the preset surface |
| Odoo owns Session and Workspace lifecycle | `packages/client/ui-workspace/src/client/rows/Rows.tsx`, `packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx`, `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | Odoo creates every session, holds the ACL, and names both, so the SPA offers no lifecycle verb: `hideNewSession` withholds the sidebar and per-row new-session buttons, the hero's Workspace chip row (its picker retargets a blank Session's Workspace, which mints one where that Workspace has no blank Session yet), and — with nothing selected — the composer, leaving a hero that only greets; `hideWorkspaceActions` withholds the Workspace row's rename/delete menu, `hideSessionActions` the Session row's slot-driven menu and its title double-click rename. The composer survives on a SELECTED blank Session: typing its first prompt is what Odoo created it for, and `skeleton.client.spec.tsx` → `MTIL blank Session: the composer survives so the first prompt can be typed` keeps a future gate from taking it away. **These gates are affordances, never authority, by decision** (2026-09-18): `session/create` still answers any valid ticket, so a caller reaching `/api` directly still mints a Session owned by that ticket's user. Requiring the `*` wildcard there was considered and declined — a self-made Session is visible only to its own creator under the `session_access` filter and grants nobody else anything, so the check would buy no confidentiality while putting a second authority rule on the create path. Do not re-propose it as unfinished work. **On merge, keep every gate and re-apply it to whatever replaces these rows** — an upstream refactor that drops one silently returns a destructive verb (delete Workspace, archive Session) to users who must not have it, and the only signal is `ui-workspace/tests/rows.client.spec.tsx` → `withholds both row menus under the MTIL lifecycle flags`. A rule in the SPA's own `custom.css` was the zero-conflict alternative and lost: these rows carry no `data-slot`, so the only selector is a per-build CSS-module hash whose rename would restore the verbs with nothing failing |

## Upstream sync procedure

1. Reset a throwaway branch to the new upstream tag and re-apply the fork, or `git merge` the tag into it.
2. Resolve group 3 files first with this map open; the behavior column says what must survive.
3. Regenerate the catalogs (`gen-cordis-catalog`, `gen-client-catalog`, `gen-config-catalog`, `gen-persistence-catalog`, `gen-doc-graphs`), then `pnpm run typecheck && pnpm run lint` and the fork-critical suites (`session-controller`, `settings-controller`, `connection`, `gateway`, `ui-workspace`, `ui-sidebar`, `ui-conversation`), then a live boot with the production overlay and one `session/list` + ticket smoke.
4. Rebuild the SPA (`apps/frontend/deploy/build-mtil.sh`) only if client packages moved.
5. Update this file: new touchpoints in, healed ones out.
