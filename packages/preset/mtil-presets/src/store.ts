/**
 * On-disk storage of authored presets, one directory per preset under the
 * configured root: `agent.cordis.yml` holds the plugin rows as entry-list
 * YAML (`!!js` expressions preserved) and the optional `preset.yml` holds
 * display text. `.mtil-roster.json` holds the deactivated preset ids.
 */
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { entryListProblem, type PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dump, load } from 'js-yaml'
import type { PresetRow } from './author.ts'

/** A stored preset id: its directory name. */
export const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/
const COMPOSITION_FILE = 'agent.cordis.yml'
const METADATA_FILE = 'preset.yml'
const ROSTER_FILE = '.mtil-roster.json'
const FILE_MODE = { mode: 0o600, dirMode: 0o700 }

/** Display text stored beside a composition. */
export interface StoredMetadata {
  readonly name?: string
  readonly description?: string
  readonly order?: number
}

/** One stored preset: its definition, or why it cannot be read. */
export type StoredPreset =
  | { readonly id: string; readonly definition: PresetDefinition }
  | { readonly id: string; readonly broken: string }

/**
 * Parse entry-list YAML into plugin rows.
 * @param content - the YAML text.
 * @returns the rows.
 * @throws when the text is not YAML or not a list of plugin rows.
 */
export function parseRows(content: string): PresetRow[] {
  const parsed: unknown = load(content, { schema: entryListSchema })
  const problem = entryListProblem(parsed)
  if (problem !== undefined) throw new Error(problem)
  return parsed as PresetRow[]
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

async function readMetadata(dir: string): Promise<StoredMetadata> {
  let raw: string
  try {
    raw = await readFile(join(dir, METADATA_FILE), 'utf8')
  } catch {
    // Display text is optional: an absent or unreadable file leaves the id as the label.
    return {}
  }
  const record = load(raw)
  if (typeof record !== 'object' || record === null) return {}
  const fields = record as Record<string, unknown>
  const name = text(fields.name)
  const description = text(fields.description)
  const order = fields.order
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...typeof order === 'number' && Number.isFinite(order) ? { order } : {},
  }
}

async function readPreset(root: string, id: string): Promise<StoredPreset> {
  const dir = join(root, id)
  let content: string
  try {
    content = await readFile(join(dir, COMPOSITION_FILE), 'utf8')
  } catch {
    return { id, broken: `the composition file ${COMPOSITION_FILE} cannot be read` }
  }
  try {
    return { id, definition: { id, ...await readMetadata(dir), plugins: parseRows(content) } }
  } catch (error: unknown) {
    return { id, broken: `${COMPOSITION_FILE}: ${(error as Error).message}` }
  }
}

/**
 * Read every stored preset directory.
 * @param root - the storage root; a missing root holds no presets.
 * @returns one entry per preset directory, in id order.
 */
export async function readStoredPresets(root: string): Promise<StoredPreset[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const ids = entries.filter(entry => entry.isDirectory() && PRESET_ID.test(entry.name)).map(entry => entry.name).sort()
  return Promise.all(ids.map(id => readPreset(root, id)))
}

/**
 * Store one preset's rows and display text, replacing any previous files.
 * @param root - the storage root.
 * @param definition - the preset to store.
 */
export async function writeStoredPreset(root: string, definition: PresetDefinition): Promise<void> {
  const dir = join(root, definition.id)
  const metadata: StoredMetadata = {
    ...definition.name === undefined ? {} : { name: definition.name },
    ...definition.description === undefined ? {} : { description: definition.description },
    ...definition.order === undefined ? {} : { order: definition.order },
  }
  const rows = dump(definition.plugins, { schema: entryListSchema, noRefs: true, lineWidth: -1 })
  await writeFileAtomic(join(dir, COMPOSITION_FILE), rows, FILE_MODE)
  if (Object.keys(metadata).length === 0) await rm(join(dir, METADATA_FILE), { force: true })
  else await writeFileAtomic(join(dir, METADATA_FILE), dump(metadata, { lineWidth: -1 }), FILE_MODE)
}

/**
 * Delete one stored preset directory.
 * @param root - the storage root.
 * @param id - the preset id.
 */
export async function removeStoredPreset(root: string, id: string): Promise<void> {
  await rm(join(root, id), { recursive: true, force: true })
}

/**
 * Read the deactivated preset ids.
 * @param root - the storage root.
 * @returns the ids; empty when none are stored.
 */
export async function readDisabled(root: string): Promise<Set<string>> {
  let raw: string
  try {
    raw = await readFile(join(root, ROSTER_FILE), 'utf8')
  } catch {
    // No roster file yet: every preset is active.
    return new Set()
  }
  const parsed: unknown = JSON.parse(raw)
  const disabled = (parsed as { disabled?: unknown } | null)?.disabled
  return new Set(Array.isArray(disabled) ? disabled.filter((id): id is string => typeof id === 'string') : [])
}

/**
 * Store the deactivated preset ids.
 * @param root - the storage root.
 * @param disabled - the complete set.
 */
export async function writeDisabled(root: string, disabled: ReadonlySet<string>): Promise<void> {
  await writeFileAtomic(join(root, ROSTER_FILE), `${JSON.stringify({ disabled: [...disabled].sort() }, null, 2)}\n`, FILE_MODE)
}
