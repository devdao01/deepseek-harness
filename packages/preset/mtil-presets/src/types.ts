/** Wire payloads of the MTIL preset management Remote. */

/** Who owns a roster row: a declared deployment preset, or one this service stores. */
export type MtilPresetTrust = 'system' | 'user'

/** One preset as the management plane reads it. */
export interface MtilPresetRow {
  /** Stable identifier. */
  readonly id: string
  /** `user` for presets this service stores; `system` for every other declaration. */
  readonly trust: MtilPresetTrust
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Whether the management plane offers this preset for new sessions. */
  readonly active: boolean
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** The roster the management plane reads. */
export interface MtilPresetRoster {
  /** Every declared and stored preset, in registry order. */
  readonly presets: readonly MtilPresetRow[]
}

/** One department subagent of an authored router preset. */
export interface AuthorPresetSubagent {
  /** Tool name the router calls (lowercase slug; also the department identity). */
  readonly toolName: string
  /** Child persona: role, duties, and the skills it owns. */
  readonly persona: string
  /** Whether the child may run shell commands. */
  readonly allowBash?: boolean
  /** Whether the child may search and fetch the web. */
  readonly allowWeb?: boolean
  /** Explicit tool grant; present, it replaces the flag-derived allow list. */
  readonly tools?: readonly string[]
}

/** Odoo connection an authored preset mounts under its own Odoo account. */
export interface AuthorPresetOdoo {
  /** Odoo base URL. */
  readonly url: string
  /** Database name. */
  readonly db: string
  /** Login of the dedicated AI account. */
  readonly user: string
  /** That account's API key or password. */
  readonly apiKey: string
  /** Whether create/write/unlink tools are offered (Odoo rights still apply). */
  readonly allowWrite?: boolean
  /** Model allowlist such as `res.partner`; absent = the account's own scope. */
  readonly allowedModels?: readonly string[]
  /** Per-call row cap; the server defaults to 200. */
  readonly maxRows?: number
  /** Tool keyword (`erp` gives `mcp__erp__erp_search_read`); default `odoo`. */
  readonly toolPrefix?: string
}

/** Request creating or rewriting one structured preset. */
export interface AuthorPresetRequest {
  /** The preset id; an existing stored preset is rewritten. */
  readonly agentPreset: string
  /** Display name. */
  readonly name: string
  /** Display description. */
  readonly description?: string
  /** `standalone` = one direct-chat agent; `router` delegates to `subagents`. */
  readonly kind: 'standalone' | 'router'
  /** The agent's own persona. */
  readonly persona: string
  /** Whether this agent may run shell commands. */
  readonly allowBash?: boolean
  /** Whether this agent may search and fetch the web. */
  readonly allowWeb?: boolean
  /** Router departments; required (non-empty) for `router`. */
  readonly subagents?: readonly AuthorPresetSubagent[]
  /** Odoo connection this preset mounts; absent = no Odoo tools. */
  readonly odoo?: AuthorPresetOdoo
}

/** Request replacing one stored preset's composition text (management plane only). */
export interface WriteRawPresetRequest {
  /** The preset id; an existing stored preset is rewritten. */
  readonly agentPreset: string
  /** Display name. */
  readonly name: string
  /** Display description. */
  readonly description?: string
  /** The complete plugin-row list as entry-list YAML. */
  readonly content: string
}

/** One grantable tool. */
export interface MtilPresetToolEntry {
  /** The tool name a `toolFilter.allow` entry grants. */
  readonly name: string
  /** The tool's model-facing description. */
  readonly description: string
}

/** The tools the default preset registers. */
export interface MtilPresetToolCatalog {
  /** One entry per visible tool, in registry order. */
  readonly tools: readonly MtilPresetToolEntry[]
}

/** Request copying one preset's composition into a new stored preset. */
export interface CopyPresetRequest {
  /** The source preset id. */
  readonly from: string
  /** The new preset id. */
  readonly id: string
  /** Display name; absent falls back to the id. */
  readonly name?: string
  /** Display description; absent keeps the source's. */
  readonly description?: string
}

/** Request rewriting one stored preset's display text. */
export interface RenamePresetRequest {
  /** The preset id, which never changes. */
  readonly agentPreset: string
  /** The new display name. */
  readonly name: string
  /** Replacement description; absent keeps the current one. */
  readonly description?: string
}
