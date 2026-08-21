/**
 * A preset's display metadata: the name and description a picker shows.
 *
 * It lives in its own file because the composition is a top-level list of
 * plugin rows — YAML cannot carry sibling keys beside it, and faking a
 * metadata row would hand the Loader something to load. Keeping it separate
 * also keeps the composition exactly what its name says: a Cordis file the
 * loader owns and the cordis preset can author.
 *
 * The file carries display text plus the preset's conventional workspace
 * pointer ONLY. `id` is the directory name and `trust` comes from the root a
 * preset was discovered under, so neither is writable here — otherwise a
 * locally authored preset could claim to be a shipped one.
 *
 * Every read failure degrades to no metadata. A preset whose display text or
 * workspace pointer is missing, malformed, or unreadable still mounts:
 * presentation is not a capability, and a broken field must never become an
 * agent that cannot start.
 * @module @deepseek-ai/dsh-agent-presets/metadata
 */

import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import yaml from 'js-yaml'

/** The optional display-metadata file beside a preset's composition. */
export const METADATA_FILE = 'preset.yml'

/** Display text a preset may publish about itself. */
export interface PresetMetadata {
  /** Human-facing name; falls back to the preset id when absent. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /**
   * Position within its group; lower comes first. A preset that declares
   * none sorts after every preset that does, then by id — so the shipped set
   * can read in capability order while authored ones stay alphabetical.
   */
  readonly order?: number
  /**
   * Absolute path of the preset's conventional default workspace, stamped when
   * the preset was authored. A relative or otherwise malformed value reads as
   * absent, the same non-fatal degradation as the display fields; a consumer
   * then falls back to the conventional `<root>/<id>` location.
   */
  readonly workspacePath?: string
}

/** A non-empty trimmed string, or undefined for anything else. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A non-empty absolute path string, or undefined for anything else. */
function absolutePath(value: unknown): string | undefined {
  const trimmed = text(value)
  return trimmed !== undefined && isAbsolute(trimmed) ? trimmed : undefined
}

/**
 * Read one preset directory's display metadata.
 *
 * Absent, unparsable, and wrongly-shaped files are all the same answer —
 * empty metadata — because the caller renders a picker, not a diagnostic.
 * @param directory - the preset directory.
 * @returns the display text the preset published, possibly empty.
 */
export async function readPresetMetadata(directory: string): Promise<PresetMetadata> {
  let raw: string
  try {
    raw = await readFile(join(directory, METADATA_FILE), 'utf8')
  } catch {
    // Absent is the common case: metadata is optional and most presets,
    // including every one authored by duplicating another, carry none.
    return {}
  }
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch {
    // Malformed display text is not worth failing discovery over; the picker
    // falls back to the id, and the composition still mounts.
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>
  const name = text(record.name)
  const description = text(record.description)
  const order = typeof record.order === 'number' && Number.isFinite(record.order)
    ? record.order
    : undefined
  const workspacePath = absolutePath(record.workspacePath)
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
    ...workspacePath === undefined ? {} : { workspacePath },
  }
}

/**
 * Render display metadata as the file's contents.
 *
 * Absent fields are omitted rather than written empty, so a preset with no
 * description does not ship a key that reads as an intentional blank.
 * @param metadata - the display text to store.
 * @returns the YAML document, or undefined when there is nothing to store.
 */
export function renderPresetMetadata(metadata: PresetMetadata): string | undefined {
  const name = text(metadata.name)
  const description = text(metadata.description)
  const { order } = metadata
  const workspacePath = absolutePath(metadata.workspacePath)
  if (name === undefined && description === undefined && order === undefined && workspacePath === undefined) {
    return undefined
  }
  return yaml.dump({
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
    ...workspacePath === undefined ? {} : { workspacePath },
  }, { lineWidth: -1 })
}
