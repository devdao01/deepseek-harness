/**
 * Host-side skill authoring: assemble, parse, and durably store one workspace
 * skill file for the `skill.read` / `skill.write` / `skill.remove` RPCs.
 *
 * A skill is addressed by `(workspacePath, name)` and lives at
 * `<workspacePath>/.agents/skills/<name>/SKILL.md`. The containment rule is the
 * security core (same shape as {@link module:workspace-file}): the skills
 * directory `<workspacePath>/.agents/skills` is the root; the skill directory
 * is `realpath`-canonicalized and must sit beneath the canonical root, so a
 * symlink planted inside the workspace cannot redirect a write or read outside
 * it. `name` is also validated to a single skill segment with no path
 * separators and no `.`/`..`, so a name alone can never traverse.
 *
 * The file format is a small YAML frontmatter block (`name`, `description`, and
 * `whenToUse` when present) followed by a blank-line separator and the body.
 * The writer emits each scalar as a JSON-quoted string (YAML is a superset of
 * JSON, so a JSON double-quoted string is a valid YAML flow scalar); the reader
 * accepts that plus plain and single-quoted scalars for files authored by hand
 * or by the skill toolchain.
 * @module
 */

import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { isSkillName } from '@deepseek-ai/dsh-skill'

/** Workspace-relative directory that holds authored skills. */
export const SKILLS_DIRECTORY = join('.agents', 'skills')

/** Skill file basename under each skill directory. */
export const SKILL_FILE_NAME = 'SKILL.md'

/**
 * Maximum UTF-8 byte length accepted for a skill body. Fixed as a safety bound,
 * never deployment config: the authoring wire hands arbitrary text to the host
 * filesystem, and letting a knob widen it would turn skill authoring into an
 * unbounded host-write channel. 64 KiB is far above any real routing body.
 */
export const SKILL_CONTENT_MAX_BYTES = 64 * 1024

/** Path separators and traversal segments a skill name must never contain. */
const NAME_SEPARATOR = /[/\\]/

/**
 * The typed failures a skill authoring operation raises; `createApiProxy` maps
 * each `code` onto the matching wire {@link RpcError} code.
 */
export type SkillAuthoringErrorCode =
  | 'skill-invalid-name'
  | 'skill-too-large'
  | 'skill-not-found'
  | 'forbidden'

/** One skill authoring failure carrying its stable wire code. */
export class SkillAuthoringError extends Error {
  constructor(readonly code: SkillAuthoringErrorCode, message: string) {
    super(message)
    this.name = 'SkillAuthoringError'
  }
}

/** The frontmatter fields a `skill.read` returns alongside the body. */
export interface SkillDocument {
  readonly description: string
  readonly whenToUse?: string
  readonly content: string
}

/** The fields a `skill.write` records. */
export interface SkillDraft {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly content: string
}

/**
 * Whether `name` is a single, non-traversing skill segment: a valid
 * `isSkillName` identifier that additionally carries no path separator and is
 * not `.`/`..`. `isSkillName` already excludes these, but the explicit checks
 * keep the path-safety guarantee independent of that regex.
 * @param name - the candidate skill name.
 * @returns true when the name is safe to use as a single path segment.
 */
export function isSafeSkillName(name: string): boolean {
  if (name === '.' || name === '..') return false
  if (NAME_SEPARATOR.test(name)) return false
  return isSkillName(name)
}

/** Reject an unsafe skill name with `skill-invalid-name`. */
function assertSafeSkillName(name: string): void {
  if (!isSafeSkillName(name)) {
    throw new SkillAuthoringError('skill-invalid-name', `invalid skill name "${name}"`)
  }
}

/** Serialize one frontmatter scalar as a JSON-quoted (hence valid YAML) string. */
function frontmatterScalar(value: string): string {
  return JSON.stringify(value)
}

/**
 * Assemble a `SKILL.md` file from a draft: a `---` frontmatter block naming
 * `name`, `description`, and (when present) `whenToUse`, a blank-line
 * separator, then the body verbatim.
 * @param draft - the skill fields to serialize.
 * @returns the complete file text.
 */
export function assembleSkillFile(draft: SkillDraft): string {
  const header = ['---', `name: ${frontmatterScalar(draft.name)}`, `description: ${frontmatterScalar(draft.description)}`]
  if (draft.whenToUse !== undefined) header.push(`whenToUse: ${frontmatterScalar(draft.whenToUse)}`)
  header.push('---')
  return `${header.join('\n')}\n\n${draft.content}`
}

/** Split a raw file into its frontmatter YAML block and the body after it, or undefined when no block opens. */
function splitFrontmatter(raw: string): { yaml: string; body: string } | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1
      return { yaml: raw.slice(start, lineStart), body: raw.slice(bodyStart) }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/** Read one scalar frontmatter value, accepting JSON double-quoted, single-quoted, or plain forms. */
function frontmatterValue(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === 'string') return parsed
    } catch {
      // A malformed double-quoted scalar falls back to its literal text rather
      // than failing the whole read: the body is still recoverable.
    }
    return value
  }
  if (value.startsWith("'")) {
    const inner = value.endsWith("'") && value.length >= 2 ? value.slice(1, -1) : value.slice(1)
    return inner.replace(/''/g, "'")
  }
  return value
}

/**
 * Parse a `SKILL.md` file into its authored fields. Absent frontmatter yields
 * an empty description and the whole file as the body. The body is the text
 * after the frontmatter block with the single separator newline the writer
 * emits stripped, so `assembleSkillFile` → `parseSkillFile` round-trips any
 * body that does not itself begin with a newline.
 * @param raw - the file text.
 * @returns the description, optional whenToUse, and body.
 */
export function parseSkillFile(raw: string): SkillDocument {
  const split = splitFrontmatter(raw)
  if (split === undefined) return { description: '', content: raw }
  let description = ''
  let whenToUse: string | undefined
  for (const line of split.yaml.split('\n')) {
    const match = /^([A-Za-z][\w-]*)\s*:\s?(.*)$/.exec(line.replace(/\r$/, ''))
    if (match === null) continue
    const [, key, rawValue] = match
    if (key === 'description') description = frontmatterValue(rawValue as string)
    else if (key === 'whenToUse') whenToUse = frontmatterValue(rawValue as string)
  }
  const content = split.body.startsWith('\n') ? split.body.slice(1) : split.body
  return { description, ...whenToUse === undefined ? {} : { whenToUse }, content }
}

/**
 * Canonical skills root of a workspace, or undefined when the directory does
 * not exist yet. Reads through `realpath` so a symlinked `.agents/skills`
 * resolves to its real location before any containment comparison.
 */
async function canonicalSkillsRoot(workspacePath: string): Promise<string | undefined> {
  try {
    return await realpath(join(workspacePath, SKILLS_DIRECTORY))
  } catch {
    // ENOENT (or an unreadable ancestor): the workspace has authored no skills.
    return undefined
  }
}

/** Assert a resolved skill directory sits beneath the canonical skills root. */
function assertContained(canonicalRoot: string, canonicalDir: string): void {
  if (!canonicalDir.startsWith(canonicalRoot + sep)) {
    throw new SkillAuthoringError('forbidden', 'skill path escapes the workspace skills directory')
  }
}

/**
 * Write one skill file, creating `<workspacePath>/.agents/skills/<name>/`
 * when absent and overwriting any existing `SKILL.md`.
 * @param workspacePath - the containing workspace's canonical directory.
 * @param draft - the skill fields to record.
 * @returns the written skill name.
 * @throws SkillAuthoringError `skill-invalid-name`, `skill-too-large`, or `forbidden`.
 */
export async function writeSkill(workspacePath: string, draft: SkillDraft): Promise<{ name: string }> {
  assertSafeSkillName(draft.name)
  if (Buffer.byteLength(draft.content, 'utf8') > SKILL_CONTENT_MAX_BYTES) {
    throw new SkillAuthoringError('skill-too-large', `skill body exceeds ${String(SKILL_CONTENT_MAX_BYTES)} bytes`)
  }
  const skillsRoot = join(workspacePath, SKILLS_DIRECTORY)
  await mkdir(skillsRoot, { recursive: true })
  const canonicalRoot = await realpath(skillsRoot)
  const skillDir = join(skillsRoot, draft.name)
  // A pre-existing skill directory (possibly a planted symlink) is checked
  // before any write; a not-yet-existing one is contained by construction
  // because `name` is a validated single segment joined onto the canonical root.
  try {
    assertContained(canonicalRoot, await realpath(skillDir))
  } catch (error: unknown) {
    if (error instanceof SkillAuthoringError) throw error
    // realpath ENOENT: the directory does not exist yet and will be created below.
  }
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, SKILL_FILE_NAME), assembleSkillFile(draft), 'utf8')
  return { name: draft.name }
}

/**
 * Read one skill file's authored fields.
 * @param workspacePath - the containing workspace's canonical directory.
 * @param name - the skill name.
 * @returns the description, optional whenToUse, and body.
 * @throws SkillAuthoringError `skill-invalid-name`, `skill-not-found`, or `forbidden`.
 */
export async function readSkill(workspacePath: string, name: string): Promise<SkillDocument> {
  assertSafeSkillName(name)
  const canonicalRoot = await canonicalSkillsRoot(workspacePath)
  if (canonicalRoot === undefined) {
    throw new SkillAuthoringError('skill-not-found', `skill "${name}" not found`)
  }
  let canonicalDir: string
  try {
    canonicalDir = await realpath(join(canonicalRoot, name))
  } catch {
    throw new SkillAuthoringError('skill-not-found', `skill "${name}" not found`)
  }
  assertContained(canonicalRoot, canonicalDir)
  let raw: string
  try {
    raw = await readFile(join(canonicalDir, SKILL_FILE_NAME), 'utf8')
  } catch {
    throw new SkillAuthoringError('skill-not-found', `skill "${name}" not found`)
  }
  return parseSkillFile(raw)
}

/**
 * Remove one skill directory. Idempotent: a name with no directory resolves to
 * `{ removed: false }` rather than failing.
 * @param workspacePath - the containing workspace's canonical directory.
 * @param name - the skill name.
 * @returns whether a directory was removed.
 * @throws SkillAuthoringError `skill-invalid-name` or `forbidden`.
 */
export async function removeSkill(workspacePath: string, name: string): Promise<{ removed: boolean }> {
  assertSafeSkillName(name)
  const canonicalRoot = await canonicalSkillsRoot(workspacePath)
  if (canonicalRoot === undefined) return { removed: false }
  let canonicalDir: string
  try {
    canonicalDir = await realpath(join(canonicalRoot, name))
  } catch {
    // No such skill directory: nothing to remove.
    return { removed: false }
  }
  assertContained(canonicalRoot, canonicalDir)
  await rm(canonicalDir, { recursive: true, force: true })
  return { removed: true }
}
