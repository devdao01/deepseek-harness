/**
 * Structured preset authoring: generate a composition from the deployment's
 * default preset plus a bounded spec — persona text, bash/web capability
 * flags, and (for a router) a list of department subagent tools.
 *
 * The caller never supplies composition text or plugin names: the generator
 * starts from the default preset's own file, replaces its persona row, drops
 * capability rows the spec withholds, and appends only fixed
 * `dsh-tool-subagent` rows whose config is built from the spec. Authoring
 * therefore grants no capability the roster's default composition did not
 * already carry, which is the same stance as copy-only authoring.
 *
 * Row surgery is line-based on the composition's stable layout: top-level
 * rows start at column 0 with `- id:` (the format every shipped preset and
 * every previously generated file uses).
 * @module @deepseek-ai/dsh-agent-presets/author
 */

/** One department subagent tool of a router preset. */
export interface AuthorSubagentSpec {
  /** Tool name the parent calls (also the department's identity). */
  readonly toolName: string
  /** Child persona: role, duties, and the skills it owns. */
  readonly persona: string
  /** Whether the child may run shell commands. */
  readonly allowBash?: boolean
  /** Whether the child may search/fetch the web. */
  readonly allowWeb?: boolean
  /**
   * Explicit tool grant (tool names per the deployment's catalog). Present,
   * it REPLACES the flag-derived allow list; the bash/web flags then only
   * document intent.
   */
  readonly tools?: readonly string[]
}

/**
 * One Odoo XML-RPC connection an authored preset carries (a mounted
 * `apps/odoo-mcp` server row under this preset's own Odoo account).
 */
export interface AuthorOdooSpec {
  /** Odoo base URL, e.g. `https://mtil.mtil.vn`. */
  readonly url: string
  /** Database name. */
  readonly db: string
  /** Login of the dedicated AI account. */
  readonly user: string
  /** That account's API key or password. */
  readonly apiKey: string
  /** Whether `odoo_create`/`odoo_write`/`odoo_unlink` are offered. */
  readonly allowWrite?: boolean
  /** Model allowlist (e.g. `res.partner`); empty/absent = the account's own scope. */
  readonly allowedModels?: readonly string[]
  /** Per-call row cap; the server defaults to 200. */
  readonly maxRows?: number
  /**
   * Keyword branding the toolset: it becomes both the MCP server name and
   * every tool's leading word (`erp` -> `mcp__erp__erp_search_read`).
   * Defaults to `odoo`.
   */
  readonly toolPrefix?: string
  /**
   * Absolute path of the odoo-mcp server script. Host-resolved by the
   * authoring plugin, NEVER taken from a remote request — a caller-supplied
   * path would let the management plane execute an arbitrary script.
   */
  readonly serverPath: string
}

/** Bounded description of one authored preset composition. */
export interface AuthorCompositionSpec {
  /** `standalone` = one direct-chat agent; `router` = delegates to `subagents`. */
  readonly kind: 'standalone' | 'router'
  /** The agent's own persona. */
  readonly persona: string
  /** Whether this agent may run shell commands. */
  readonly allowBash?: boolean
  /** Whether this agent may search/fetch the web. */
  readonly allowWeb?: boolean
  /** Router departments; ignored for `standalone`. */
  readonly subagents?: readonly AuthorSubagentSpec[]
  /** Odoo connection to mount for this preset, when any. */
  readonly odoo?: AuthorOdooSpec
}

/** Tool names every generated department child receives. */
const SUBAGENT_BASE_TOOLS = [
  'read', 'read_image', 'write', 'edit', 'glob', 'grep',
  'skill', 'todo_write', 'ask_user_question',
  'job_list', 'job_output', 'job_kill',
] as const

/** `toolName` is a model-visible tool identifier and a config key. */
const SUBAGENT_TOOL_NAME = /^[a-z0-9][a-z0-9_-]*$/

/** An Odoo model name (`res.partner`); anything else is refused. */
const ODOO_MODEL_NAME = /^[a-z0-9_.]+$/

/** A tool-prefix keyword: MCP server-name charset, kept short. */
const ODOO_TOOL_PREFIX = /^[a-z0-9][a-z0-9_-]{0,23}$/

/** A granted tool name is a plain tool identifier, never YAML structure. */
const GRANTED_TOOL_NAME = /^[a-zA-Z0-9_-]+$/

/** One parsed top-level composition row (or group) as a line range. */
interface RowBlock {
  readonly start: number
  end: number
  readonly id: string
}

/** Split a composition into its top-level `- id:` blocks. */
function splitRows(lines: readonly string[]): RowBlock[] {
  const blocks: RowBlock[] = []
  let current: RowBlock | undefined
  for (const [index, line] of lines.entries()) {
    const match = /^- id: (\S+)/.exec(line)
    if (match !== null) {
      if (current !== undefined) current.end = index
      current = { start: index, end: index + 1, id: match[1] as string }
      blocks.push(current)
    } else if (current !== undefined) {
      current.end = index + 1
    }
  }
  return blocks
}

/** Render arbitrary text as an indented YAML block scalar body. */
function blockScalar(text: string, indent: string): string[] {
  return text.split('\n').map(line => indent + line.replace(/\s+$/, ''))
}

/** The generated persona row replacing (or preceding) the base's. */
function personaRow(persona: string): string[] {
  return [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    text: >-',
    ...blockScalar(persona, '      '),
    '',
  ]
}

/** One generated department `dsh-tool-subagent` row. */
function subagentRow(spec: AuthorSubagentSpec): string[] {
  const allow = spec.tools !== undefined && spec.tools.length > 0
    ? [...new Set(spec.tools)]
    : [
      ...spec.allowBash === true ? ['bash'] : [],
      ...spec.allowWeb === true ? ['web_search', 'web_fetch'] : [],
      ...SUBAGENT_BASE_TOOLS,
    ]
  return [
    `- id: tool-subagent-${spec.toolName}`,
    "  name: '@deepseek-ai/dsh-tool-subagent'",
    '  config:',
    '    provider: spawn',
    `    toolName: ${spec.toolName}`,
    '    backgroundMode: one-shot',
    '    maxDepth: 1',
    '    persona: >-',
    ...blockScalar(spec.persona, '      '),
    '    toolFilter:',
    '      allow:',
    ...allow.map(name => `        - ${name}`),
    '',
  ]
}

/** Quote one value as YAML single-quoted scalar (quotes doubled). */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** The generated `mcp-odoo` row mounting this preset's Odoo connection. */
function odooRow(odoo: AuthorOdooSpec): string[] {
  const prefix = odoo.toolPrefix ?? 'odoo'
  return [
    '- id: mcp-odoo',
    "  name: '@deepseek-ai/dsh-mcp-client'",
    '  config:',
    `    serverName: ${prefix}`,
    '    transport: stdio',
    '    command: node',
    `    args: [${yamlQuote(odoo.serverPath)}]`,
    '    env:',
    ...prefix === 'odoo' ? [] : [`      ODOO_TOOL_PREFIX: ${yamlQuote(prefix)}`],
    `      ODOO_URL: ${yamlQuote(odoo.url)}`,
    `      ODOO_DB: ${yamlQuote(odoo.db)}`,
    `      ODOO_USER: ${yamlQuote(odoo.user)}`,
    `      ODOO_API_KEY: ${yamlQuote(odoo.apiKey)}`,
    ...odoo.allowWrite === true ? ["      ODOO_ALLOW_WRITE: '1'"] : [],
    ...odoo.allowedModels !== undefined && odoo.allowedModels.length > 0
      ? [`      ODOO_ALLOWED_MODELS: ${yamlQuote(odoo.allowedModels.join(','))}`]
      : [],
    ...odoo.maxRows === undefined ? [] : [`      ODOO_MAX_ROWS: ${yamlQuote(String(odoo.maxRows))}`],
    '',
  ]
}

/**
 * Refuse an Odoo connection whose fields could break the generated YAML or
 * name something other than an Odoo endpoint.
 * @param odoo - the connection to validate.
 * @throws when a required field is empty or multi-line, the URL is not
 * http(s), a model name is not an Odoo model slug, or maxRows is not a
 * positive integer.
 */
function validateOdooSpec(odoo: AuthorOdooSpec): void {
  for (const [field, value] of Object.entries({
    url: odoo.url, db: odoo.db, user: odoo.user, apiKey: odoo.apiKey, serverPath: odoo.serverPath,
  })) {
    if (value.trim() === '') throw new Error(`odoo.${field} must be a non-empty string`)
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`odoo.${field} must be a single line`)
  }
  if (!/^https?:\/\//.test(odoo.url)) throw new Error('odoo.url must start with http:// or https://')
  for (const model of odoo.allowedModels ?? []) {
    if (!ODOO_MODEL_NAME.test(model)) {
      throw new Error(`odoo model name ${JSON.stringify(model)} must match ${String(ODOO_MODEL_NAME)}`)
    }
  }
  if (odoo.maxRows !== undefined && (!Number.isInteger(odoo.maxRows) || odoo.maxRows < 1)) {
    throw new Error('odoo.maxRows must be a positive integer')
  }
  if (odoo.toolPrefix !== undefined && !ODOO_TOOL_PREFIX.test(odoo.toolPrefix)) {
    throw new Error(`odoo.toolPrefix ${JSON.stringify(odoo.toolPrefix)} must match ${String(ODOO_TOOL_PREFIX)}`)
  }
}

/**
 * Refuse a spec whose free-form fields could break the generated layout.
 * @param spec - the composition description to validate.
 * @throws when a persona is empty, a router names no departments, a tool
 * name is not a lowercase slug, or the Odoo connection is unusable.
 */
export function validateAuthorSpec(spec: AuthorCompositionSpec): void {
  if (spec.persona.trim() === '') throw new Error('persona must be a non-empty string')
  if (spec.odoo !== undefined) validateOdooSpec(spec.odoo)
  if (spec.kind === 'router') {
    const subagents = spec.subagents ?? []
    if (subagents.length === 0) throw new Error('a router preset needs at least one subagent')
    const seen = new Set<string>()
    for (const subagent of subagents) {
      if (!SUBAGENT_TOOL_NAME.test(subagent.toolName)) {
        throw new Error(`subagent toolName ${JSON.stringify(subagent.toolName)} must match ${String(SUBAGENT_TOOL_NAME)}`)
      }
      if (seen.has(subagent.toolName)) {
        throw new Error(`subagent toolName ${JSON.stringify(subagent.toolName)} is duplicated`)
      }
      seen.add(subagent.toolName)
      if (subagent.persona.trim() === '') {
        throw new Error(`subagent ${JSON.stringify(subagent.toolName)} needs a persona`)
      }
      for (const tool of subagent.tools ?? []) {
        if (!GRANTED_TOOL_NAME.test(tool)) {
          throw new Error(`granted tool name ${JSON.stringify(tool)} must match ${String(GRANTED_TOOL_NAME)}`)
        }
      }
    }
  }
}

/**
 * Generate one composition from a base composition and a bounded spec.
 *
 * The base's persona row is replaced (prepended when the base has none),
 * `tool-bash`/`tool-pwsh` rows are dropped without `allowBash`, `tool-web`
 * without `allowWeb`, the `delegation` group is dropped for a standalone
 * agent, and router department rows are appended.
 * @param base - the default preset's composition text.
 * @param spec - the validated composition description.
 * @returns the generated composition text.
 */
export function generateComposition(base: string, spec: AuthorCompositionSpec): string {
  validateAuthorSpec(spec)
  const lines = base.split('\n')
  const blocks = splitRows(lines)
  const personaBlock = blocks.find(block => block.id === 'persona')
  const drop = new Set<string>()
  if (spec.allowBash !== true) {
    drop.add('tool-bash')
    drop.add('tool-pwsh')
  }
  if (spec.allowWeb !== true) drop.add('tool-web')
  if (spec.kind === 'standalone') drop.add('delegation')

  const out: string[] = []
  if (personaBlock === undefined) out.push(...personaRow(spec.persona))
  for (let index = 0; index < lines.length; index += 1) {
    if (personaBlock !== undefined && index >= personaBlock.start && index < personaBlock.end) {
      if (index === personaBlock.start) out.push(...personaRow(spec.persona))
      continue
    }
    const block = blocks.find(candidate => index >= candidate.start && index < candidate.end)
    if (block !== undefined && drop.has(block.id)) {
      index = block.end - 1
      continue
    }
    out.push(lines[index] as string)
  }
  if (spec.kind === 'router') {
    out.push('', '# ── generated departments (agentPresets/author) ──', '')
    for (const subagent of spec.subagents ?? []) out.push(...subagentRow(subagent))
  }
  if (spec.odoo !== undefined) {
    out.push('', '# ── generated Odoo connection (agentPresets/author) ──', '')
    out.push(...odooRow(spec.odoo))
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}
