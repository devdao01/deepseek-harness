---
description: "MTIL preset management: presets the Odoo management plane authors, stored on disk and declared through the preset registry."
kind: "package-reference"
---

# @deepseek-ai/dsh-mtil-presets

## Summary

`dsh-mtil-presets` gives the MTIL Odoo module the preset operations the declarative registry deliberately leaves out: copy, structured authoring, raw composition writes, rename, delete, a tool catalog for authoring pickers, and a deactivation flag. It stores each authored preset on disk and declares it through `ctx.agentPresets.register()`, so an authored preset mounts, retires, and binds to Agents exactly like a deployment-declared one; this package owns no Agent binding.

No runtime invariant companion is published because this package has no independently changing observations; every stored preset is either declared to the registry or listed with the reason it could not be.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row next to `agent-preset-registry`, which it injects:

```yaml
- id: mtil-presets
  name: '@deepseek-ai/dsh-mtil-presets'
  config:
    ticketSecret: '<the Odoo ticket secret>'
    odooMcpServer: '/home/mit/deepseek-harness/apps/odoo-mcp/server.mjs'
```

| Field | Default | Meaning |
|---|---|---|
| `root` | `$DSH_HOME/.agent-presets` | Storage directory (`~` expands) |
| `ticketSecret` | unset | Set, `writeRaw` accepts only the `*` management wildcard ticket |
| `odooMcpServer` | unset | Absolute server path written into authored Odoo connections; unset, authoring one is refused |

The `mtilPresets` Remote namespace offers `list`, `copy`, `deletePreset`, `author`, `writeRaw`, `rename`, `setActive`, and `toolCatalog`; `agentPresets/read` stays the registry's. `list` adds `trust` (`user` for presets this package stores, `system` otherwise) and `active` to the registry roster, and lists a stored preset that cannot be declared with its `broken` reason. Only stored presets can be renamed, rewritten, or deleted; `setActive` covers every preset.

<a id="understand-the-implementation"></a>
## Understand the implementation

Each preset is a directory `<root>/<id>/` holding `agent.cordis.yml` (the plugin rows as entry-list YAML, `!!js` expressions preserved) and an optional `preset.yml` (`name`, `description`, `order`). `<root>/.mtil-roster.json` holds the deactivated ids. A write stores the files, retires the previous declaration, and declares the new definition; Agents already bound keep the revision they run, as with any registry update. Mutations run one at a time.

`author` generates rows from the default preset's rows (read through `agentPresets/read`): the persona row is replaced, `tool-bash`/`tool-pwsh` and `tool-web` are dropped unless granted, a standalone agent loses the `delegation` group, and only fixed `dsh-tool-subagent` department rows and a `dsh-mcp-client` Odoo row are appended.

| File | Responsibility |
|---|---|
| [index.ts](src/index.ts) | Remote operations and registry declarations |
| [author.ts](src/author.ts) | Structured composition generator |
| [store.ts](src/store.ts) | On-disk storage |

<a id="model-experience"></a>
## Model Experience

### Authored presets

#### What the model sees

Nothing from this package directly: an authored preset's rows own the persona, tools, and department subagent tools the model sees. A generated department row registers its `toolName` as a `subagent`-style tool whose `persona` and `toolFilter.allow` come from the authoring request.

#### Token effect

None from this package; each generated row declares its own tools and prompt sections.

#### KV Cache effect

A write declares a new revision; Agents already bound keep their prefix, and new Agents build theirs from the new rows.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Deactivation is a roster flag for the management plane: the Odoo module stops offering an archived preset, but `agentPresets/select` and `session/create` still accept its id.
- A rename re-declares the preset; the Workspace group titled after it is re-titled when the next Session is created in it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Remote methods take one request object wherever a field is optional, because the Typert generator refuses optional Remote parameters.

</details>
