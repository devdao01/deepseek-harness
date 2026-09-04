# odoo-mcp — Odoo access for harness agents, read-only by default

An MCP stdio server giving one agent preset access to Odoo over XML-RPC,
under **one dedicated Odoo account per preset**. Mount it as a row in that
preset's `agent.cordis.yml`; the harness bridges its tools as
`mcp__odoo__odoo_search_read`, `…_read`, `…_search_count`, `…_fields_get` —
plus `…_create`, `…_write`, `…_unlink` when `ODOO_ALLOW_WRITE=1`.

Dependency-free: `node apps/odoo-mcp/server.mjs`, nothing to install.

## Why per preset

`dsh-mcp-client` is mounted by a composition, and each preset is its own
composition — so the account AND the write switch are properties of the
preset. Two presets mount two rows with different `env`: one read-only
analyst, one write-enabled operator, each under its own Odoo account.
A preset with no row has no Odoo tools at all.

## Odoo side

1. Create a dedicated user (e.g. `ai-ketoan`) and set its groups and record
   rules to exactly what that preset may see — and, for a write-enabled
   preset, what it may create/update/delete. **Odoo's access rights are the
   real boundary**; the server adds the model allowlist and the write switch
   in front of them.
2. Generate an API key for that user (Preferences → Account Security → New API
   Key) and use it as `ODOO_API_KEY`. An API key is a purpose-made password:
   revocable on its own, valid for XML-RPC even when 2FA is on, and never
   opens the web UI session the human password does.
3. Repeat per preset that needs different visibility or different write scope.

## Preset row

Two ways to get the row into a preset. The MTIL Odoo module's preset form
has an **Odoo Connection** tab (URL, database, account, key, write switch,
model allowlist) — saving the preset regenerates the composition with this
row through `agentPresets/author`, which also resolves the server path
host-side. Hand-written rows (below) suit presets managed outside Odoo; note
a later authored save from Odoo regenerates the composition, so pick one
management plane per preset.

```yaml
- id: mcp-odoo
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: odoo
    transport: stdio
    command: node
    args: ['/home/mit/deepseek-harness/apps/odoo-mcp/server.mjs']
    env:
      ODOO_URL: 'https://mtil.mtil.vn'
      ODOO_DB: 'mtil'
      ODOO_USER: 'ai-ketoan'
      # Keep the key out of the composition file: name an environment
      # variable the harness process already carries (systemd unit, .env).
      ODOO_API_KEY: !!js process.env.ODOO_KEY_KETOAN ?? ''
      ODOO_ALLOW_WRITE: '1'
      ODOO_ALLOWED_MODELS: 'res.partner,account.move,account.move.line'
      ODOO_MAX_ROWS: '200'
```

| Variable | Default | Meaning |
|---|---|---|
| `ODOO_URL` | required | Odoo base URL |
| `ODOO_DB` | required | database name |
| `ODOO_USER` | required | login of the AI account |
| `ODOO_API_KEY` | required | that account's API key (or password) |
| `ODOO_ALLOW_WRITE` | off | `1`/`true` lists and permits `odoo_create` / `odoo_write` / `odoo_unlink` |
| `ODOO_ALLOWED_MODELS` | every model the account may use | comma-separated allowlist, refused before any call |
| `ODOO_MAX_ROWS` | `200` | hard cap per call; a larger `limit` or id list is clamped |

## What the agent can and cannot do

Without `ODOO_ALLOW_WRITE`, only four Odoo methods are reachable —
`search_read`, `read`, `search_count`, `fields_get`; the write tools are not
even listed, so a read-only preset cannot reach a write method at all. With
the flag, `create`, `write`, and `unlink` join them. Arbitrary model methods
(`execute_kw` passthrough) are never exposed either way. Odoo access rights
and record rules still apply on top, per account.

A tool failure (Odoo `AccessError`, a model outside the allowlist, bad
credentials) is returned to the model as an error message it can act on, not
as a transport failure.

Prior art: [erpipe-org/mcp-odoo](https://github.com/erpipe-org/mcp-odoo)
gates writes behind a preview/validate/approve workflow plus an environment
flag. This server keeps only the environment flag and the per-account rights:
the human decision is made once, per preset, by whoever composes it — not
per call.
