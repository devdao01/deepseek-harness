# MTIL Chat AI — nginx add-on

`mtil-ai.conf` is an **add-on to your existing** mtil nginx config, not a
standalone site. Your host already proxies `/api/mtil/*` (the MTIL API) and
Odoo. This adds only the two new pieces, which MUST stay on the SAME origin so
the per-user `dsh_ticket` cookie (`HttpOnly; Secure; SameSite=Strict;
Path=/api`) reaches the harness:

| Route | Upstream | Serves |
|---|---|---|
| `/api/*` | harness (`dsh web`, 127.0.0.1:3080) | unary RPC, `/api/respond`, the two WebSocket downlinks (`events.mux`/`events.host`), and the GET downloads |
| SPA path (`/` or a subpath) | static (`apps/frontend/dist`) | the app shell; client routes like `/s/:sessionId` fall back to `index.html` |

`/api/mtil/*` and Odoo stay exactly as you have them — longest-prefix keeps your
`/api/mtil/` location winning over the new `/api/` block, so order is irrelevant.

## Install (paste, don't replace)

1. Put `map $connection_upgrade` + `upstream harness` in the `http {}` context
   (skip the map if Odoo's websocket already defines it).
2. Paste the `location ^~ /api/` and the SPA `location` blocks **into your
   existing `server { server_name mtil…; }`** — do not create a second server
   block for this host.
3. Build and copy the SPA:
   ```sh
   cd apps/frontend && pnpm install && pnpm build
   sudo mkdir -p /var/www/mtilai && sudo cp -r dist/* /var/www/mtilai/
   ```
4. `sudo nginx -t && sudo systemctl reload nginx`.

## The trust fence (do not skip)

The harness admits a browser request only when `Origin` equals the `Host`
authority AND that host is trusted. The config forwards the **public host**
(`proxy_set_header Host $host`) and leaves `Origin` untouched, so
`Origin === Host` holds. You must also tell the harness to trust that host:

```sh
dsh web --trusted-host mtil.example.com
# or trustedHosts: ['mtil.example.com'] in the web bundle's cordis.patch.yml
```

The value is a **bare host authority** — `host` or `host:port`, NOT a URL.
`https://mtil.example.com`, a trailing `/`, or a path fails the load with
"is not a bare host[:port] authority". Omit `:port` when the browser reaches it
on the default 443 through nginx.

Without it, every browser `/api` request answers `403` at the fence.

## Env that must line up

Ticket auth only works when the harness and the (already-deployed) MTIL API
share one secret:

```sh
# harness (dsh web)
DSH_TICKET_SECRET=<≥32 chars>            # SAME value as the MTIL API
dsh web --trusted-host mtil.example.com  # DSH_API_TOKEN auto-generates at ~/.dsh/api-token

# MTIL API (apps/api.py, already on this host) — confirm it has:
DSH_TICKET_SECRET=<same as above>
DSH_HARNESS_BASE_URL=http://127.0.0.1:3080
DSH_HARNESS_API_TOKEN=<contents of ~/.dsh/api-token>
```

## SPA path

Served at `/` by default. If root is already your MTIL/Odoo app, put the SPA on
a subpath: rebuild with `BASE_PATH=/mtilai/`, serve it with an `alias`, and set
the router basename. The API stays root-absolute (`/api/...`), so it reaches the
harness from any SPA path.

## Notes

- **TLS is required** — the ticket cookie is `Secure`, never sent over `http://`
  (set `DSH_TICKET_COOKIE_SECURE=0` in the MTIL API ONLY for a plain-HTTP LAN test).
- If your login/MTIL API is on a **different** origin than this host, the SPA
  won't receive the MTIL session cookie here — keep them same-origin.
- `client_max_body_size` must stay at/above the harness `maxRequestBodyBytes`
  for image attachments.
