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
| `npei.agent.session` | Odoo-side ACL. `session_id` (unique), `name`, `user_ids` (allowed), `preset_id`, `workspace_path`, `active`, plus Odoo's `create_uid`/`create_date`/`write_date`. Access is defined by `user_ids`; `create_uid` (the creator) is always allowed. Helper `_user_can_access(session_id, user)`. SQL `unique(session_id)`. |
| `npei.agent.preset` | Preset mirror. `preset_id` (unique), `name`, `description`, `workspace_path`, `trust` (`system`/`user`), `active`. `action_sync_from_harness()` upserts from `agentPreset.list`. |
| `npei.agent.skill` | Skill mirror. `skill_key` (unique), `name`, `description`, `source`, `active`. `action_sync_from_harness()` upserts from `skill.list`. |
| `res.config.settings` | Inherits to surface the two config keys in Settings. |

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
3. **Harness (out of scope this phase).** The harness enforces its own ACL
   independently. This module leaves a clean seam and does not rely on the
   harness for authorization.

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
