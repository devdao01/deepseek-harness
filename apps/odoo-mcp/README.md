# odoo-mcp — MTIL access for harness agents, read-only by default

An MCP stdio server giving one agent preset access to MTIL over XML-RPC,
under **one dedicated MTIL account per preset**. Mount it as a row in that
preset's `agent.cordis.yml`; the harness bridges its tools as
`mcp__odoo__odoo_search_read`, `…_read`, `…_search_count`, `…_fields_get` —
plus `…_create`, `…_write`, `…_unlink` when `MTIL_ALLOW_WRITE=1`.

Dependency-free: `node apps/odoo-mcp/server.mjs`, nothing to install.

## Why per preset

`dsh-mcp-client` is mounted by a composition, and each preset is its own
composition — so the account AND the write switch are properties of the
preset. Two presets mount two rows with different `env`: one read-only
analyst, one write-enabled operator, each under its own MTIL account.
A preset with no row has no MTIL tools at all.

## MTIL side

1. Create a dedicated user (e.g. `ai-ketoan`) and set its groups and record
   rules to exactly what that preset may see — and, for a write-enabled
   preset, what it may create/update/delete. **MTIL's access rights are the
   real boundary**; the server adds the model allowlist and the write switch
   in front of them.
2. Generate an API key for that user (Preferences → Account Security → New API
   Key) and use it as `MTIL_API_KEY`. An API key is a purpose-made password:
   revocable on its own, valid for XML-RPC even when 2FA is on, and never
   opens the web UI session the human password does.
3. Repeat per preset that needs different visibility or different write scope.

## Preset row

Two ways to get the row into a preset. The MTIL MTIL module's preset form
has an **MTIL Connection** tab (URL, database, account, key, write switch,
model allowlist) — saving the preset regenerates the composition with this
row through `agentPresets/author`. The server path needs NO configuration on
that route: the harness locates its own `apps/odoo-mcp/server.mjs` by walking
up from the running plugin, so it is correct wherever the repo is checked
out. Hand-written rows (below) suit presets managed outside MTIL — there the
`args` path must be the absolute repo path on the harness host (spawned
without a shell, so `~` is NOT expanded). A later authored save from MTIL
regenerates the composition, so pick one management plane per preset.

```yaml
- id: mcp-odoo
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: mtil
    transport: stdio
    command: node
    args: ['/home/mit/deepseek-harness/apps/odoo-mcp/server.mjs']
    env:
      MTIL_URL: 'https://mtil.mtil.vn'
      MTIL_DB: 'mtil'
      MTIL_USER: 'ai-ketoan'
      # Keep the key out of the composition file: name an environment
      # variable the harness process already carries (systemd unit, .env).
      MTIL_API_KEY: !!js process.env.MTIL_KEY_KETOAN ?? ''
      MTIL_ALLOW_WRITE: '1'
      MTIL_ALLOWED_MODELS: 'res.partner,account.move,account.move.line'
      MTIL_MAX_ROWS: '200'
```

| Variable | Default | Meaning |
|---|---|---|
| `MTIL_URL` | required | MTIL base URL |
| `MTIL_DB` | required | database name |
| `MTIL_USER` | required | login of the AI account |
| `MTIL_API_KEY` | required | that account's API key (or password) |
| `MTIL_ALLOW_WRITE` | off | `1`/`true` lists and permits `mtil_create` / `mtil_write` / `mtil_unlink` |
| `MTIL_TOOL_PREFIX` | `mtil` | keyword starting every tool name (`erp` -> `erp_search_read`); pair it with the row's `serverName` so the full name reads `mcp__erp__erp_search_read`. A non-default prefix also rebrands every model-visible string: descriptions and errors say the uppercased prefix (or `MTIL_BRAND`) instead of "Odoo", and backend fault text is sanitized likewise — the model gets no tool-derived evidence of what stands behind the toolset |
| `MTIL_BRAND` | uppercased prefix | display label used in descriptions/errors when the default derivation does not fit |
| `MTIL_ALLOWED_MODELS` | every model the account may use | comma-separated allowlist, refused before any call |
| `MTIL_MAX_ROWS` | `200` | hard cap per call; a larger `limit` or id list is clamped |

## What the agent can and cannot do

Without `MTIL_ALLOW_WRITE`, only four MTIL methods are reachable —
`search_read`, `read`, `search_count`, `fields_get`; the write tools are not
even listed, so a read-only preset cannot reach a write method at all. With
the flag, `create`, `write`, and `unlink` join them. Arbitrary model methods
(`execute_kw` passthrough) are never exposed either way. MTIL access rights
and record rules still apply on top, per account.

A tool failure (MTIL `AccessError`, a model outside the allowlist, bad
credentials) is returned to the model as an error message it can act on, not
as a transport failure.

Prior art: [erpipe-org/mcp-odoo](https://github.com/erpipe-org/mcp-odoo)
gates writes behind a preview/validate/approve workflow plus an environment
flag. This server keeps only the environment flag and the per-account rights:
the human decision is made once, per preset, by whoever composes it — not
per call.
