/**
 * Structured preset authoring: one composition generated from the default
 * preset's plugin rows plus a bounded spec. The caller supplies no plugin
 * names: the persona row is replaced, capability rows the spec withholds are
 * dropped, and only fixed `dsh-tool-subagent` and `dsh-mcp-client` rows built
 * from validated spec fields are appended, so authoring grants no capability
 * the default composition did not already carry.
 */
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { AuthorPresetOdoo, AuthorPresetSubagent } from './types.ts'

/** One plugin row of a preset composition. */
export type PresetRow = PresetDefinition['plugins'][number]

/** Bounded description of one authored composition. */
export type AuthorCompositionSpec = {
  /** The agent's own persona. */
  readonly persona: string
  /** Whether this agent may run shell commands. */
  readonly allowBash?: boolean | undefined
  /** Whether this agent may search and fetch the web. */
  readonly allowWeb?: boolean | undefined
  /** Odoo connection, with the deployment-configured server script path. */
  readonly odoo?: (AuthorPresetOdoo & { readonly serverPath: string }) | undefined
} & (
  /** One direct-chat agent. */
  | { readonly kind: 'standalone' }
  /** A router delegating to one department tool per subagent. */
  | { readonly kind: 'router'; readonly subagents: readonly AuthorPresetSubagent[] }
)

/** Tool names every generated department child receives. */
const SUBAGENT_BASE_TOOLS = [
  'read', 'read_image', 'write', 'edit', 'glob', 'grep',
  'skill', 'todo_write', 'ask_user_question',
  'job_list', 'job_output', 'job_kill',
] as const

/** A department tool name is a model-visible identifier and a row id suffix. */
const SUBAGENT_TOOL_NAME = /^[a-z0-9][a-z0-9_-]*$/
/** An Odoo model name such as `res.partner`. */
const ODOO_MODEL_NAME = /^[a-z0-9_.]+$/
/** The Odoo tool keyword, within the MCP server-name character set. */
const ODOO_TOOL_PREFIX = /^[a-z0-9][a-z0-9_-]{0,23}$/
/** A granted tool name is a plain tool identifier. */
const GRANTED_TOOL_NAME = /^[a-zA-Z0-9_-]+$/
/** Control characters a single-line Odoo field must not carry. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

function validateOdoo(odoo: NonNullable<AuthorCompositionSpec['odoo']>): void {
  const required = { url: odoo.url, db: odoo.db, user: odoo.user, apiKey: odoo.apiKey, serverPath: odoo.serverPath }
  for (const [field, value] of Object.entries(required)) {
    if (value.trim() === '') throw new Error(`odoo.${field} must be a non-empty string`)
    if (CONTROL_CHARACTER.test(value)) throw new Error(`odoo.${field} must be a single line`)
  }
  if (!/^https?:\/\//.test(odoo.url)) throw new Error('odoo.url must start with http:// or https://')
  for (const model of odoo.allowedModels ?? []) {
    if (!ODOO_MODEL_NAME.test(model)) throw new Error(`odoo model name ${JSON.stringify(model)} must match ${String(ODOO_MODEL_NAME)}`)
  }
  if (odoo.maxRows !== undefined && (!Number.isInteger(odoo.maxRows) || odoo.maxRows < 1)) {
    throw new Error('odoo.maxRows must be a positive integer')
  }
  if (odoo.toolPrefix !== undefined && !ODOO_TOOL_PREFIX.test(odoo.toolPrefix)) {
    throw new Error(`odoo.toolPrefix ${JSON.stringify(odoo.toolPrefix)} must match ${String(ODOO_TOOL_PREFIX)}`)
  }
}

function validateSubagents(subagents: readonly AuthorPresetSubagent[]): void {
  if (subagents.length === 0) throw new Error('a router preset needs at least one subagent')
  const seen = new Set<string>()
  for (const subagent of subagents) {
    if (!SUBAGENT_TOOL_NAME.test(subagent.toolName)) {
      throw new Error(`subagent toolName ${JSON.stringify(subagent.toolName)} must match ${String(SUBAGENT_TOOL_NAME)}`)
    }
    if (seen.has(subagent.toolName)) throw new Error(`subagent toolName ${JSON.stringify(subagent.toolName)} is duplicated`)
    seen.add(subagent.toolName)
    if (subagent.persona.trim() === '') throw new Error(`subagent ${JSON.stringify(subagent.toolName)} needs a persona`)
    for (const tool of subagent.tools ?? []) {
      if (!GRANTED_TOOL_NAME.test(tool)) throw new Error(`granted tool name ${JSON.stringify(tool)} must match ${String(GRANTED_TOOL_NAME)}`)
    }
  }
}

/**
 * Refuse a spec whose fields cannot produce a usable composition.
 * @param spec - the composition description.
 * @throws when the persona is empty, a router names no or invalid departments, or the Odoo connection is unusable.
 */
export function validateAuthorSpec(spec: AuthorCompositionSpec): void {
  if (spec.persona.trim() === '') throw new Error('persona must be a non-empty string')
  if (spec.odoo !== undefined) validateOdoo(spec.odoo)
  if (spec.kind === 'router') validateSubagents(spec.subagents)
}

function subagentRow(spec: AuthorPresetSubagent): PresetRow {
  const allow = spec.tools !== undefined && spec.tools.length > 0
    ? [...new Set(spec.tools)]
    : [
      ...spec.allowBash === true ? ['bash'] : [],
      ...spec.allowWeb === true ? ['web_search', 'web_fetch'] : [],
      ...SUBAGENT_BASE_TOOLS,
    ]
  return {
    id: `tool-subagent-${spec.toolName}`,
    name: '@deepseek-ai/dsh-tool-subagent',
    config: {
      provider: 'spawn',
      toolName: spec.toolName,
      backgroundMode: 'one-shot',
      maxDepth: 1,
      persona: spec.persona,
      toolFilter: { allow },
    },
  }
}

function odooRow(odoo: NonNullable<AuthorCompositionSpec['odoo']>): PresetRow {
  const prefix = odoo.toolPrefix ?? 'odoo'
  return {
    id: 'mcp-odoo',
    name: '@deepseek-ai/dsh-mcp-client',
    config: {
      serverName: prefix,
      transport: 'stdio',
      command: 'node',
      args: [odoo.serverPath],
      env: {
        ...prefix === 'odoo' ? {} : { ODOO_TOOL_PREFIX: prefix },
        ODOO_URL: odoo.url,
        ODOO_DB: odoo.db,
        ODOO_USER: odoo.user,
        ODOO_API_KEY: odoo.apiKey,
        ...odoo.allowWrite === true ? { ODOO_ALLOW_WRITE: '1' } : {},
        ...odoo.allowedModels !== undefined && odoo.allowedModels.length > 0
          ? { ODOO_ALLOWED_MODELS: odoo.allowedModels.join(',') }
          : {},
        ...odoo.maxRows === undefined ? {} : { ODOO_MAX_ROWS: String(odoo.maxRows) },
      },
    },
  }
}

/**
 * Generate one composition from the default preset's rows and a spec.
 *
 * The persona row is replaced (prepended when the base has none) and carries
 * the authored text as its whole prefix; `tool-bash`/`tool-pwsh` rows are
 * dropped without `allowBash`, `tool-web` without `allowWeb`, and the
 * `delegation` group for a standalone agent.
 * @param base - the default preset's top-level plugin rows.
 * @param spec - the composition description.
 * @returns the generated rows.
 * @throws when the spec is invalid.
 */
export function generateComposition(base: readonly PresetRow[], spec: AuthorCompositionSpec): PresetRow[] {
  validateAuthorSpec(spec)
  const drop = new Set<string>([
    ...spec.allowBash === true ? [] : ['tool-bash', 'tool-pwsh'],
    ...spec.allowWeb === true ? [] : ['tool-web'],
    ...spec.kind === 'standalone' ? ['delegation'] : [],
  ])
  const persona: PresetRow = { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: spec.persona } }
  const kept = base.filter(row => row.id === undefined || !drop.has(row.id))
  const rows = kept.some(row => row.id === 'persona')
    ? kept.map(row => row.id === 'persona' ? persona : row)
    : [persona, ...kept]
  return [
    ...rows,
    ...spec.kind === 'router' ? spec.subagents.map(subagentRow) : [],
    ...spec.odoo === undefined ? [] : [odooRow(spec.odoo)],
  ]
}
