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
}

/** Tool names every generated department child receives. */
const SUBAGENT_BASE_TOOLS = [
  'read', 'read_image', 'write', 'edit', 'glob', 'grep',
  'skill', 'todo_write', 'ask_user_question',
  'job_list', 'job_output', 'job_kill',
] as const

/** `toolName` is a model-visible tool identifier and a config key. */
const SUBAGENT_TOOL_NAME = /^[a-z0-9][a-z0-9_-]*$/

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
  const allow = [
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

/**
 * Refuse a spec whose free-form fields could break the generated layout.
 * @param spec - the composition description to validate.
 * @throws when a persona is empty, a router names no departments, or a tool
 * name is not a lowercase slug.
 */
export function validateAuthorSpec(spec: AuthorCompositionSpec): void {
  if (spec.persona.trim() === '') throw new Error('persona must be a non-empty string')
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
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}
