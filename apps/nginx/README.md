# MTIL Chat AI — nginx same-origin proxy

`mtil-ai.conf` puts the SPA, the MTIL API, and the harness behind **one public
origin**. This is not a preference — the per-user `dsh_ticket` cookie is
`HttpOnly; Secure; SameSite=Strict; Path=/api`, so it only reaches the harness
when the harness is served from the SAME origin as the MTIL API that set it.
Split them and per-user auth silently stops working.

## Topology

```
                         ┌──────────────────────────────────────────┐
  browser ──https──▶ nginx (mtil.example.com, TLS)                   │
                         │  /api/mtil/*  ─▶ MTIL API (Flask)         │  apps/api.py
                         │  /api/*       ─▶ harness  (dsh web)       │  127.0.0.1:3080
                         │  /            ─▶ SPA static (dist/)       │  apps/frontend
                         │  /web /odoo…  ─▶ Odoo (optional, login)   │  127.0.0.1:8069
                         └──────────────────────────────────────────┘
```

Longest-prefix wins, so `/api/mtil/` is matched before `/api/`.

## What each upstream is

| Route | Upstream | Serves |
|---|---|---|
| `/api/mtil/*` | MTIL API (Flask, `apps/api.py`) | `get_config_v2` (auth gate + sets the ticket cookie), `session_create` (server-side `session.create` + `setAccess(creator)`) |
| `/api/*` | harness (`dsh web`, 127.0.0.1:3080) | unary RPC, `/api/respond`, the two WebSocket downlinks (`events.mux`/`events.host`), and the GET downloads (`session.export`, `workspace.file`) |
| `/` | SPA static (`apps/frontend/dist`) | the app shell; client routes like `/s/:sessionId` fall back to `index.html` |
| `/web`, `/odoo`, `/websocket` | Odoo (optional) | the login that mints the MTIL session cookie, and the management UI |

## Fill in before reloading

In `mtil-ai.conf`:
- `server_name` — your public host (both server blocks).
- `ssl_certificate` / `ssl_certificate_key` — your TLS pair.
- the `upstream` addresses — where the MTIL API and `dsh web` actually listen.
- `root /var/www/mtilai` — where you copied the SPA build.

## The trust fence (do not skip)

The harness admits a browser request only when the `Origin` header equals the
`Host` authority AND that host is trusted. The config forwards the **public
host** (`proxy_set_header Host $host`) and leaves the browser `Origin`
untouched, so `Origin === Host` holds. You must ALSO tell the harness to trust
that host:

```sh
dsh web --trusted-host mtil.example.com
# or trustedHosts: ['mtil.example.com'] in the web bundle's cordis.patch.yml
```

Without it every browser request answers `403` at the fence.

## Harness env (`dsh web`)

```sh
DSH_TICKET_SECRET=<≥32 chars, IDENTICAL to the MTIL API>   # turns on ticket auth + the ACL store
# DSH_API_TOKEN is auto-generated at ~/.dsh/api-token on first boot
dsh web --trusted-host mtil.example.com
```

## MTIL API env (`apps/api.py`, copy into your Flask app)

```sh
DSH_TICKET_SECRET=<same value as the harness>     # signs the ticket the harness verifies
DSH_HARNESS_BASE_URL=http://127.0.0.1:3080        # server-side, never exposed to the browser
DSH_HARNESS_API_TOKEN=<contents of ~/.dsh/api-token>  # full token; server-side only
# DSH_TICKET_COOKIE_SECURE=1 by default (HTTPS). Set 0 ONLY for a plain-HTTP LAN test.
```

Also wire `_current_user_id()` to your real MTIL session check, and make sure
the `user_id` it returns is the SAME id space the session ACL is keyed by (what
Odoo/`setAccess` grants).

## Deploy steps

1. Build the SPA and copy it:
   ```sh
   cd apps/frontend && pnpm install && pnpm build
   sudo mkdir -p /var/www/mtilai && sudo cp -r dist/* /var/www/mtilai/
   ```
2. Start `dsh web` (with `DSH_TICKET_SECRET` + `--trusted-host`) and the MTIL API
   (with the env above).
3. Install the site config:
   ```sh
   sudo cp apps/nginx/mtil-ai.conf /etc/nginx/sites-available/mtil-ai.conf
   sudo ln -s /etc/nginx/sites-available/mtil-ai.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Visit `https://mtil.example.com`, sign in to MTIL, and confirm: the app loads
   past the "Đang kết nối MTIL AI…" gate, `get_config_v2` is 2xx, and a new
   session opens (create routes through `/api/mtil/session_create`).

## Notes

- **TLS is required** in production because the ticket cookie is `Secure`.
- If Odoo is a **different** origin, the SPA won't receive the MTIL session
  cookie on this origin — put the login/MTIL API on THIS origin, or front Odoo
  here too (uncomment the Odoo blocks).
- Large image attachments: `client_max_body_size` must stay at/above the
  harness `maxRequestBodyBytes`.
