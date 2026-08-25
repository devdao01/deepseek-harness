# NPEI Agent Harness (Odoo 17)

Odoo module that makes **Odoo the single gateway** between the browser SPA and
the DeepSeek Harness backend. The SPA (served at `/mtilai`) only ever calls
Odoo; Odoo injects the harness Bearer token server-side and proxies the call.
**The harness token never reaches the browser.**

This is the *"Odoo module first"* phase. The frontend gate (loading/denied
screens driven by `get_config`) and the realtime event proxy are later phases.

> **Module layout / naming.** This module *is* the `npei_agent_harness`
> directory: its `__manifest__.py` sits at `apps/npei_agent_harness/`, so the
> **technical name is `npei_agent_harness`** and the addons-path entry is the
> parent `apps/` directory:
>
> ```ini
> ; odoo.conf
> addons_path = /path/to/deepseek-harness-fork/apps,/path/to/odoo/addons
> ```
>
---

## Install

1. Add the parent `apps/` directory to Odoo's `addons_path` (see above).
2. Update the apps list and install **NPEI Agent Harness**. Requires only
   `base` and `web`. Python dependency: `requests` (bundled with Odoo).
3. Assign users to **NPEI Agent User** (may use their own sessions) or
   **NPEI Agent Manager** (full CRUD + harness sync) under `Settings → Users`.

## Configure the harness connection

`Settings → MTIL Agent` (manager only):

| Setting | `ir.config_parameter` key | Notes |
|---|---|---|
| **Base URL** | `npei_agent_harness.base_url` | e.g. `https://harness.internal:8787`. The gateway appends `/api/<method>`. No trailing slash needed. |
| **API Token** | `npei_agent_harness.api_token` | The harness Bearer token. On the harness host: `cat ~/.dsh/api-token`. Stored server-side only. |
| **Ticket Secret** | `npei_agent_harness.ticket_secret` | Shared HMAC-SHA256 secret (≥ 32 chars) the MTIL Flask API (`apps/api.py`) signs per-user tickets with; must equal the harness `DSH_TICKET_SECRET`. The Flask API reads it from this parameter over the shared database. Stored server-side only. |

If either value is unset, every proxy call fails loud with **HTTP 502**
(`harness-not-configured`) and the sync actions raise a `UserError`.

> The harness trust fence lets a request carrying a valid
> `Authorization: Bearer <token>` **and no browser marker** through from
> anywhere. Odoo's server-side `requests` calls have no `Origin`/`sec-fetch-*`
> markers, so the token alone authenticates them.

---

## Deployment topology (same-origin)

Both Odoo and the SPA are served from `mtil.mtil.vn`, so the Odoo session cookie
is sent automatically and **no CORS is needed** (and none is emitted). The
harness gateway is reachable only server-side.

```nginx
server {
    server_name mtil.mtil.vn;

    # Odoo web client + backend.
    location /web/ {
        proxy_pass http://127.0.0.1:8069;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA static bundle.
    location /mtilai/ {
        alias /var/www/mtilai/;
        try_files $uri $uri/ /mtilai/index.html;
    }

    # SPA ⇆ Odoo gateway (must reach Odoo, same-origin, no CORS).
    location /api/mtil/ {
        proxy_pass http://127.0.0.1:8069;
        proxy_set_header Host $host;
        proxy_set_header Cookie $http_cookie;   # carry the Odoo session
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The SPA calls `/api/mtil/...`; Odoo resolves the session cookie into
`request.env.user`, enforces the ACL, and forwards to the harness with the
server-held Bearer token. The harness `/api` is **not** exposed to the browser.

---

## Endpoints

All under `/api/mtil`. All are `type='http'`, `auth='public'` with a manual
public-user check, `csrf=False`. Odoo 17 has no `auth='bearer'`, and
`type='json'` cannot return a real 401 (it wraps everything in a JSON-RPC 200),
so these are `type='http'` with explicit status codes.

| Method | Path | ACL | Status codes |
|---|---|---|---|
| `POST` | `/api/mtil/get_config` | logged-in Odoo user | `200` authenticated, `401` anonymous |
| `POST` | `/api/mtil/session_access` | logged-in Odoo user | `200` `{"allowed": bool}`, `401` anonymous |
| `POST` | `/api/mtil/rpc/<path:method>` | session ACL if payload carries a session id | relayed harness status, `401` anonymous, `403` ACL denied, `502` harness unreachable/unconfigured |
| `GET`  | `/api/mtil/download/<path:kind>` | session ACL (`sessionId` in query) | relayed harness status, `401`, `403`, `502` |
| `GET/POST` | `/api/mtil/events/<channel>` | — | `501` (deferred, see below) |

### `get_config`

- Anonymous → `401 {"authenticated": false}`.
- Logged-in → `200 {"authenticated": true, "user": {id, name, login},
  "harness": {"basePath": "/api"}}`. **Never** includes the harness token.

### `rpc/<method>`

`<method>` is an `RpcMethodMap` key (`session.prompt`, `workspace.list`, …) or a
remote-gateway method (`messageFeedback/list`); the `<path:...>` converter keeps
the `/`. The raw `client-request` envelope is forwarded **verbatim** and the
harness `server-response` is relayed **verbatim** — the RPC-result envelope and
business error codes survive unchanged. HTTP status only describes the carrier.

**Session ACL.** Before forwarding, the body is parsed and any harness session
id is extracted from `payload.sessionId` / `payload.parentSessionId` /
`payload.childSessionId`, plus the remote-gateway nesting
`payload.args.request.sessionId`. Each id is checked with
`npei.agent.session._user_can_access(session_id, user)`; any failure → `403`.
Calls with no session id (`session.list`, `workspace.list`, `agentPreset.list`,
…) forward without a per-session check.

### `download/<kind>`

Covers `session.export` and `workspace.file`, both of which carry `sessionId` in
the query string (same ACL). Bytes stream back with the harness `Content-Type`
and `Content-Disposition` preserved. Harness-side rejections (403 for symlink
escape or executable files, 404, 400) relay verbatim.

---

## Models

| Model | Purpose |
|---|---|
| `npei.agent.harness.client` | `AbstractModel` HTTP helper: `_get_connection()` (reads the config keys, fails loud), `_rpc(method, payload)` (unary call, unwraps `result.value`). |
| `npei.agent.session` | Odoo-side ACL. `session_id` (unique, **auto-created**), `name`, `user_ids` (allowed), `preset_id`, `workspace_path`, `active`, plus Odoo's `create_uid`/`create_date`/`write_date`. Choosing a preset defaults `workspace_path` from the preset mirror's recorded `workspace_path` (the absolute `<presetWorkspacesRoot>/<preset id>` the harness provisioned — no re-slugging in Odoo). Saving without a `session_id` calls harness `session.create` (`cwd`=`workspace_path`, `agentPreset`=preset key) and fills the returned id; a blank workspace lets the harness derive it from the preset. A provided id adopts an existing session. Access is defined by `user_ids`; `create_uid` (the creator) is always allowed for Odoo visibility. Helper `_user_can_access(session_id, user)`. SQL `unique(session_id)`. |
| `npei.agent.preset` | Preset mirror **+ authoring**. `preset_id` (unique, **auto**), `name`, `description`, `workspace_path`, `trust` (`system`/`user`), `active`. Creating a record with only a `name` (no `preset_id`) authors it on the harness: `agentPreset.copy(from=<default>, agentPreset=_slugify(name), name)` — `_slugify` strips Vietnamese diacritics to a hyphen id the harness accepts (`'Hồ Sơ X'`→`ho-so-x`), the provisioned `workspace.path` is stored, `trust` is `user`. `name`/`description` are pushed to the harness via `agentPreset.update` on create and on write (the copy carries no description); editing them in Odoo updates the preset's `preset.yml`. A slug already taken on the harness (e.g. an orphan from an earlier failed create) is rejected up front with a clear message pointing at Sync, not the raw `agent-preset-invalid`; the post-copy display push is best-effort so a transient failure never rolls the record back and orphans the harness copy. A record given a `preset_id` mirrors/adopts; `action_sync_from_harness()` upserts from `agentPreset.list` (with `npei_syncing` so mirrored values are not echoed back). `session_ids` (One2many → sessions on this preset) backs a Sessions smart button. |
| `npei.agent.skill` | Skill mirror. `skill_key` (unique), `name`, `description`, `source`, `active`. `action_sync_from_harness()` upserts from `skill.list`. |
| `npei.agent.credential` | Credential-reference mirror + write-only set/unset. `ref` (unique), `configured`/`source`/`writable` (read-only, from `credentials.describe`), `value` (write-only, `store=False`, never persisted). `action_sync_from_harness()` describes every ref; `action_set_value()` pushes `credentials.set({ref, value})` then re-describes and blanks the value; `action_unset()` pushes `credentials.unset({ref})` then re-describes. Manager-only. |
| `npei.agent.provider` | LLM provider mirror. `provider` (unique), `display_name`, `settings_ns`, `settings_id` (Many2one → `npei.agent.setting`, matched by `settings_ns == ns`), `settings_path` (the harness `settingsPath` joined with `/`), `route_active` (harness `active`), `declared`, Odoo `active` (archive), `model_ids` (configurable), `catalog_model_ids` (resolved). `action_sync_from_harness()` upserts from `llm.providers`, links `settings_id`, and backfills `npei.agent.model.provider_id`. |
| `npei.agent.model` | LLM model catalog mirror (**read-only**). `model_id`, `provider` (raw group id, unique-constraint partner), `provider_id` (Many2one → `npei.agent.provider`, matched by group id == provider id), `name`, `description`, `active`; `unique(provider, model_id)`. `action_sync_from_harness()` upserts each group's models from `llm.models` and links `provider_id` when a provider mirror matches; group `failures` are logged. Syncing providers backfills the link for models synced earlier. |
| `npei.agent.provider.model` | **Editable** per-provider model catalog (the SPA's model-config equivalent). `provider_id` (M2o provider), `sequence`, `model_id`, `name`, `context_window`, `max_tokens`; `unique(provider_id, model_id)`. Every create/write/unlink recomputes the whole `models` array and pushes it via `settings.mutate({ns: provider.settings_ns, ops:[{op:'set', path: settings_path+['models'], value:[…]}]})`; emptying a provider's rows **unsets** the path (return to the inherited catalog). Optional `context_window`/`max_tokens` of 0 and a blank `name` omit their keys. `action_sync_from_harness()` mirrors each provider's effective `models` (resolved `value`, else raw `user`) into rows under `npei_syncing` so the mirror write is not echoed back. Manager-only writes. |
| `npei.agent.setting` | Settings-namespace mirror + whole-section replace. `ns` (unique), `applies` (`live`/`restart`), `has_document`, `revision`, `value_json` (redacted resolved value, read-only), `user_json` (raw user section, editable), `provider_ids` (One2many → providers using this namespace). `action_sync_from_harness()` upserts from `settings.describe` and backfills `npei.agent.provider.settings_id`; `action_save()` parses `user_json` and pushes `settings.replace({ns, section, expectedRevision})`, refusing a stale revision with a re-sync hint. Manager-only writes. |
| `npei.agent.provider.route.template` | Seed catalog of common gateways (OpenRouter, Together, Groq, Fireworks, DeepSeek, OpenAI, Anthropic, xAI, Mistral), shipped as `noupdate` data (`data/provider_route_templates.xml`). `name`, `route_key`, `api_protocol`, `base_url`, `thinking_format`, `note`, `sequence`, `active`. The wizard's **From Template** dropdown reads these to pre-fill a new route so only the key is left to enter. Managed under Configuration → Provider Route Templates. |
| `npei.agent.provider.route` | Transient wizard — **add** an OpenAI-/Anthropic-compatible provider route (OpenRouter, Together, …) on the `llm-pi-ai` adapter. `route_key`, `display_name`, `api` (protocol), `base_url`, `api_key_env`, `api_key` (write-only), `thinking_format`, `models_text`. `action_create_route()` writes the profile with a path-scoped `settings.mutate({ns:'llm-pi-ai', ops:[{op:'set', path:['providers', route_key], value:{…}}]})` (leaves sibling routes intact), pushes a typed key via `credentials.set`, and syncs providers. Manager-only. |
| `npei.agent.discover.models` | Transient wizard. `settings_ns` (required), `provider`, `base_url`, `api`, `api_key` (write-only), `result_text`/`result_json` (read-only), `target_provider_id`. `action_discover()` sends `llm.discoverModels({settingsNs, …non-blank keys})` and keeps the raw list; `action_adopt()` appends the discovered models into `target_provider_id`'s `npei.agent.provider.model` rows (skipping ids it already configures), which pushes them into the provider's settings namespace. Manager-only. |
| `npei.agent.host.status` | Transient read-only ops panel. `version`, `cwd`, `provider`, `model`, `attached_sessions`, `can_open_path` (all read-only). Opening it (`default_get`) and the **Refresh** button both call `host.describe({})` and map the snapshot; nothing is configurable. Absent optional `provider`/`model` map to blank. Manager-only. |
| `res.config.settings` | Inherits to surface the two config keys in Settings, a **Test Connection** button (`host.describe`), and a system-only (`base.group_system`) **Clear Data** button. `action_clear_data()` deletes every persistent `npei.agent.*` record except the XML-seeded route templates (kept by their `ir.model.data` external ids); it runs the deletes under `npei_syncing` so session/provider-model unlinks make **no harness call** (the reset works even when the harness is unreachable). |

The harness stays the source of truth for live data; these models are the
Odoo-side management + ACL layer only.

---

## ACL model (two layers)

1. **Odoo ORM (this module).**
   - ACL (`ir.model.access.csv`): users read presets/skills and CRUD their own
     sessions (no unlink); managers get everything.
   - Record rule on `npei.agent.session`: a non-manager sees a mapping only when
     `create_uid == user` **or** `user in user_ids`; managers see all.
2. **Controller re-check.** The proxy calls `_user_can_access` before forwarding
   any session-scoped call. Fails **closed**: an unmapped session id is denied to
   non-managers.
3. **Harness access store (mirrored).** On every `npei.agent.session`
   create/write/unlink the module pushes the allowed set to the harness
   `session.setAccess` (full-token RPC), so a browser talking to the harness
   directly with a per-user **ticket** is filtered by the SAME set. It sends
   exactly `user_ids` as `str(res.users.id)`; an archived mapping or an unlink
   sends the empty set (revoke all). The sync is **fail-loud** — an unreachable
   harness raises and rolls the Odoo write back rather than letting the two
   planes diverge — and the session form's **Push Access to Harness** button
   (`action_push_access`) re-pushes on demand.

   > The pushed `str(res.users.id)` MUST equal the `u` claim the ticket minter
   > (MTIL `get_config_v2`) signs — the two must share one user-id space, or a
   > user's ticket will not match the ids granted here.

---

## Managing presets & skills

- CRUD the mirror records under `MTIL Agent → Presets` / `Skills`.
- Sync from the harness: the **Sync from Harness** button on a record's form, or
  the manager-only menu items `MTIL Agent → Configuration → Sync Presets/Skills
  from Harness` (these work even when the list is empty). Both are gated to
  **NPEI Agent Manager**.

> **Wire note:** `skill.list` requires a `sessionId`, so the skill sync reuses
> the most recently updated mapped `npei.agent.session` and fails loud if none
> exists yet. `SkillEntry` carries only `{name, description, whenToUse?,
> modelInvocable}` — `skill_key`/`name` map to `name`, and `source` is populated
> from `whenToUse` (there is no dedicated key/source on the wire).

---

## Config-plane management (credentials, providers, models, settings)

The config-plane models let a manager drive the harness configuration from Odoo
with the server-side full token. Each action maps to one harness method:

| Odoo action | Harness method + payload |
|---|---|
| `npei.agent.credential.action_sync_from_harness` | `credentials.describe({refs: [all mirror refs]})` |
| `npei.agent.credential.action_set_value` | `credentials.set({ref, value})`, then `credentials.describe({refs: [ref]})` |
| `npei.agent.credential.action_unset` | `credentials.unset({ref})`, then `credentials.describe({refs: [ref]})` |
| `npei.agent.provider.action_sync_from_harness` | `llm.providers({})` |
| `npei.agent.model.action_sync_from_harness` | `llm.models({})` |
| `npei.agent.provider.model` create/write/unlink | `settings.mutate({ns, ops:[{op:'set'\|'unset', path: settings_path+['models'], value}]})` |
| `npei.agent.provider.model.action_sync_from_harness` | `settings.describe({})` (reads each provider's effective `models`) |
| `npei.agent.discover.models.action_discover` | `llm.discoverModels({settingsNs, provider?, baseURL?, api?, apiKey?})` (blank optional keys omitted) |
| `npei.agent.discover.models.action_adopt` | (no direct RPC — creates `npei.agent.provider.model` rows, which push `settings.mutate`) |
| `npei.agent.setting.action_sync_from_harness` | `settings.describe({})` |
| `npei.agent.setting.action_save` | `settings.replace({ns, section, expectedRevision})` |
| `npei.agent.host.status.action_refresh` / `default_get` | `host.describe({})` |

Reach these under **MTIL Agent** (Providers, Models are user-readable;
Credentials, Settings, and the Configuration → Discover Models / Sync … menus are
manager-only). Each syncable model has an `ir.actions.server` behind a
Configuration menu item so a sync can run even when the list is empty.

> **Deployment note — unpin the config methods.** Odoo reaches these with the
> harness full token, so the harness deployment must **unpin** `credentials.*`,
> `settings.*`, and `llm.discoverModels`. The model-catalog reads `llm.providers`
> and `llm.models` are not pinned. Secrets (the credential `value` and the
> discover `api_key`) are write-only, non-stored Odoo fields — they are never
> persisted in an Odoo column, only forwarded to the harness.

### Adding an OpenAI-compatible provider (e.g. OpenRouter)

OpenRouter is not a separate adapter — it is a **route on the `llm-pi-ai`
adapter** (OpenAI-compatible gateway). Prerequisite: the harness composes the
`llm-pi-ai` adapter (a `llm-pi-ai` namespace shows up in **Settings** after a
sync); a DeepSeek-only deployment has no route capability.

1. **Configuration → Add Provider Route**: pick **From Template** = *OpenRouter*
   (pre-fills `route_key`, `openai-completions`, the base URL, and
   `thinkingFormat: openrouter`), then paste the API key — that is all a known
   gateway needs. The wizard writes `settings[llm-pi-ai].user.providers.openrouter`
   with a path-scoped `settings.mutate` (sibling routes untouched) and stores the
   key under `OPENROUTER_API_KEY`. Base URL is optional: leave it blank for a
   provider the pi-ai catalog already ships (the route inherits the catalog
   endpoint); templates fill it for gateways that need an explicit endpoint. Edit
   or add templates under Configuration → Provider Route Templates.
2. **Providers** now lists `openrouter`; open it and edit **Configured Models**
   (`npei.agent.provider.model`), or use **Discover Models** → **Adopt** to seed
   them. Its `settings_path` is `providers/openrouter`, so the same model-config
   surface pushes there.

The same flow adds Together, Fireworks, a self-hosted vLLM gateway, etc. — pick
the matching protocol and base URL.

### Ghi chú (vi)

Nhóm model config-plane cho phép **NPEI Agent Manager** quản lý cấu hình harness
ngay trong Odoo bằng full token phía máy chủ: credential (`credentials.*`),
provider/model (`llm.providers`/`llm.models`), dò tìm model
(`llm.discoverModels`) và settings namespace (`settings.describe`/`replace`).
Bí mật (`value` của credential, `api_key` khi dò model) là trường **write-only,
không lưu** trong Odoo — chỉ chuyển tiếp cho harness. Deployment harness phải
**unpin** `credentials.*`, `settings.*` và `llm.discoverModels` để full token của
Odoo gọi được.

---

## DEFERRED: WebSocket / SSE event mux proxy

**Not built in this phase.** The harness `WS /api/events.mux` emits **every**
session's events on one downlink. A per-user ACL therefore requires Odoo to
**proxy and filter** that stream down to only the sessions the caller may
access — a separate design task, not a straight passthrough like the unary
proxy. `WS /api/events.host` (host lifecycle/workspace frames) is not
per-session but is deferred alongside it. `/api/mtil/events/<channel>` currently
returns **501**.

Two candidate approaches, to be decided in a later phase:

1. **Odoo-side filtered SSE re-emit.** Odoo opens one upstream WS to the harness
   (server-to-server, Bearer token), then re-emits to each browser an
   SSE/WebSocket stream filtered to that user's allowed session ids (computed
   from `npei.agent.session`). Pros: no harness change; single upstream socket.
   Cons: Odoo must run a long-lived async task and fan-out/filter per connection
   — awkward inside Odoo's worker model (needs gevent/longpolling or an external
   relay process); every `session/subscribed`/`approval`/`question` frame must be
   ACL-checked.
2. **Harness-side per-user scoped stream.** Add a harness endpoint that accepts a
   scoping token (or an explicit allow-list Odoo passes) and streams only that
   user's sessions. Pros: filtering happens at the source; Odoo just tunnels.
   Cons: requires a harness API change and a way for Odoo to mint/pass a
   per-user scope safely.

---

## Security notes

- CSRF is disabled on these API routes (they are cookie-authenticated,
  same-origin API calls, not HTML form posts). Odoo's session cookie is
  `SameSite=Lax`, which blocks cross-site POSTs; keep it that way and keep the
  deployment same-origin. If cross-origin access is ever introduced, add an
  explicit `Origin`/`sec-fetch-site` check here.
- `sudo()` is used only to read the harness secret (`ir.config_parameter`) and
  to evaluate the session mapping in `_user_can_access` — never to bypass the
  per-user ACL that decides whether to forward.
- The harness token is only ever read server-side and attached to outbound
  `requests` calls.
