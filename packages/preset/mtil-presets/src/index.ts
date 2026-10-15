/**
 * MTIL preset management over the declarative preset registry. Presets the
 * management plane (the Odoo module) authors are stored on disk and declared
 * through `ctx.agentPresets.register()`, so they mount, retire, and bind to
 * Agents exactly like deployment-declared presets; this service adds only
 * the authoring operations, the `trust`/`active` roster view, and the
 * deactivation flag.
 * @module @deepseek-ai/dsh-mtil-presets
 */
import { resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { dshHomePath, expandHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { currentTicketUserId } from '@deepseek-ai/dsh-user-ticket'
import { generateComposition, validateAuthorSpec, type AuthorCompositionSpec, type PresetRow } from './author.ts'
import {
  parseRows, PRESET_ID, readDisabled, readStoredPresets, removeStoredPreset, writeDisabled, writeStoredPreset,
} from './store.ts'
import type {
  AuthorPresetRequest, CopyPresetRequest, MtilPresetRoster, MtilPresetRow, MtilPresetToolCatalog,
  RenamePresetRequest, WriteRawPresetRequest,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mtilPresets: MtilPresets
  }
}

/** Storage directory, relative to the Harness home, that earlier fork releases also used. */
const DEFAULT_ROOT = '.agent-presets'

/** Deployment configuration. */
export interface Config {
  /** Storage root for authored presets (`~` expands); default `$DSH_HOME/.agent-presets`. */
  root?: string
  /** Shared ticket secret; set, `writeRaw` accepts only the `*` management wildcard. */
  ticketSecret?: string
  /** Absolute path of `apps/odoo-mcp/server.mjs`; unset, authoring an Odoo connection is refused. */
  odooMcpServer?: string
}

/** Configuration after defaulting. */
interface Spec {
  readonly root: string
  readonly ticketSecret: string | undefined
  readonly odooMcpServer: string | undefined
}

/**
 * Apply the documented defaults.
 * @param config - the validated plugin config.
 * @returns the storage root, ticket secret, and Odoo MCP server path in effect.
 */
export function resolveConfig(config: Config): Spec {
  return {
    root: resolve(expandHomePath(config.root ?? dshHomePath(DEFAULT_ROOT))),
    ticketSecret: config.ticketSecret === '' ? undefined : config.ticketSecret,
    odooMcpServer: config.odooMcpServer === '' ? undefined : config.odooMcpServer,
  }
}

function badRequest(message: string): RemoteError {
  return new RemoteError('gateway/bad-request', message, {})
}

function invalid(agentPreset: string, reason: string): RemoteError {
  return new RemoteError('agent-preset/invalid', `agent preset "${agentPreset}": ${reason}`, { agentPreset, reason })
}

/** Build a definition whose absent display fields stay absent. */
function definitionOf(id: string, name: string | undefined, description: string | undefined, plugins: PresetRow[]): PresetDefinition {
  return {
    id,
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    plugins,
  }
}

function requireName(name: string): void {
  if (name.trim() === '') throw badRequest('name must be a non-empty string')
}

/** Authored preset storage and management Remote over `ctx.agentPresets`. */
export class MtilPresets extends TypertRemoteService {
  static inject = ['agentPresets', 'tools']
  static Config: z<Config> = z.object({
    root: z.string(),
    ticketSecret: z.string(),
    odooMcpServer: z.string(),
  })

  private readonly spec: Spec
  /** Current definitions of the stored presets this service declared. */
  private readonly stored = new Map<string, PresetDefinition>()
  /** Disposers of those declarations. */
  private readonly declared = new Map<string, () => Promise<void>>()
  /** Stored presets that could not be declared, with the reason. */
  private readonly unreadable = new Map<string, string>()
  private disabled = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'mtilPresets')
    this.spec = resolveConfig(config)
  }

  /** Declare every stored preset; the declarations are retired with this service. */
  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => async () => {
      for (const dispose of this.declared.values()) await dispose()
      this.declared.clear()
    }, 'mtil-presets: stored declarations')
    this.disabled = await readDisabled(this.spec.root)
    for (const preset of await readStoredPresets(this.spec.root)) {
      if ('broken' in preset) this.unreadable.set(preset.id, preset.broken)
      else await this.declare(preset.definition)
    }
  }

  private async declare(definition: PresetDefinition): Promise<void> {
    try {
      this.declared.set(definition.id, await this.ctx.agentPresets.register(definition))
      this.stored.set(definition.id, definition)
      this.unreadable.delete(definition.id)
    } catch (error: unknown) {
      this.unreadable.set(definition.id, (error as Error).message)
    }
  }

  private async retire(id: string): Promise<void> {
    const dispose = this.declared.get(id)
    this.declared.delete(id)
    this.stored.delete(id)
    this.unreadable.delete(id)
    await dispose?.()
  }

  /** Run one mutation after every earlier one settled. */
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run)
    this.queue = next.catch(() => undefined)
    return next
  }

  private isStored(id: string): boolean {
    return this.stored.has(id) || this.unreadable.has(id)
  }

  private async rosterIds(): Promise<Set<string>> {
    return new Set([...(await this.ctx.agentPresets.list()).map(row => row.id), ...this.unreadable.keys()])
  }

  /** Store and (re)declare one preset; an existing declaration is retired first. */
  private async store(definition: PresetDefinition): Promise<void> {
    await writeStoredPreset(this.spec.root, definition)
    await this.retire(definition.id)
    await this.declare(definition)
  }

  /** Refuse a write that would replace a deployment-declared preset or claim a bad id. */
  private async assertWritable(id: string): Promise<void> {
    if (!PRESET_ID.test(id)) throw invalid(id, `the id must match ${String(PRESET_ID)}`)
    if (!this.isStored(id) && (await this.rosterIds()).has(id)) throw invalid(id, 'it ships with the deployment')
  }

  private async rowsOf(agentPreset: string): Promise<{ rows: PresetRow[]; description: string | undefined }> {
    const document = await this.ctx.agentPresets.readDocument(agentPreset)
    return { rows: parseRows(document.content), description: document.description }
  }

  /**
   * Read every preset with its owner and activation state.
   * @returns the registry roster plus stored presets that could not be declared.
   */
  @Remote('list')
  async remoteExportList(): Promise<MtilPresetRoster> {
    const defaultId = this.ctx.agentPresets.defaultId
    const rows: MtilPresetRow[] = (await this.ctx.agentPresets.list()).map(row => ({
      id: row.id,
      trust: this.stored.has(row.id) ? 'user' : 'system',
      isDefault: row.id === defaultId,
      active: !this.disabled.has(row.id),
      ...row.name === undefined ? {} : { name: row.name },
      ...row.description === undefined ? {} : { description: row.description },
      ...row.broken === undefined ? {} : { broken: row.broken },
    }))
    for (const [id, broken] of this.unreadable) {
      rows.push({ id, trust: 'user', isDefault: id === defaultId, active: !this.disabled.has(id), broken })
    }
    return { presets: rows }
  }

  /**
   * Copy one preset's composition into a new stored preset.
   * @param request - source, new id, and display text.
   * @returns once the copy is declared.
   * @throws {RemoteError} `agent-preset/not-found` for an unknown source, `agent-preset/invalid` for a taken or unusable id.
   */
  @Remote('copy')
  remoteExportCopy(request: CopyPresetRequest): Promise<void> {
    return this.serial(async () => {
      if (!PRESET_ID.test(request.id)) throw invalid(request.id, `the id must match ${String(PRESET_ID)}`)
      if ((await this.rosterIds()).has(request.id)) throw invalid(request.id, 'the id is already taken')
      const source = await this.rowsOf(request.from)
      await this.store(definitionOf(request.id, request.name, request.description ?? source.description, source.rows))
    })
  }

  /**
   * Delete one stored preset. Sessions already bound to it keep their revision.
   * @param id - the preset id.
   * @returns once the declaration is retired and the files are gone.
   * @throws {RemoteError} `agent-preset/invalid` for a preset this service does not store.
   */
  @Remote('deletePreset')
  remoteExportDelete(id: string): Promise<void> {
    return this.serial(async () => {
      if (!this.isStored(id)) throw invalid(id, 'only stored presets can be deleted')
      await this.retire(id)
      await removeStoredPreset(this.spec.root, id)
      if (this.disabled.delete(id)) await writeDisabled(this.spec.root, this.disabled)
    })
  }

  /**
   * Create or rewrite one structured preset generated from the default
   * preset's rows; the caller supplies no plugin names.
   * @param request - identity, display text, and the composition spec.
   * @returns once the preset is declared.
   * @throws {RemoteError} `gateway/bad-request` for an unusable spec, `agent-preset/invalid` for a deployment id.
   */
  @Remote('author')
  remoteExportAuthor(request: AuthorPresetRequest): Promise<void> {
    return this.serial(async () => {
      requireName(request.name)
      await this.assertWritable(request.agentPreset)
      const spec: AuthorCompositionSpec = {
        persona: request.persona,
        allowBash: request.allowBash,
        allowWeb: request.allowWeb,
        odoo: this.odooFor(request),
        ...request.kind === 'router' ? { kind: 'router', subagents: request.subagents ?? [] } : { kind: 'standalone' },
      }
      try {
        validateAuthorSpec(spec)
      } catch (error: unknown) {
        throw badRequest((error as Error).message)
      }
      const base = await this.rowsOf(this.ctx.agentPresets.defaultId)
      await this.store(definitionOf(request.agentPreset, request.name, request.description, generateComposition(base.rows, spec)))
    })
  }

  /** Attach the configured server path to a requested Odoo connection. */
  private odooFor(request: AuthorPresetRequest): AuthorCompositionSpec['odoo'] {
    if (request.odoo === undefined) return undefined
    const serverPath = this.spec.odooMcpServer
    if (serverPath === undefined) {
      throw badRequest('this deployment configures no odooMcpServer; an Odoo connection cannot be authored')
    }
    return { ...request.odoo, serverPath }
  }

  /**
   * Replace one stored preset's plugin rows with caller-supplied YAML. The
   * caller names arbitrary plugins, so with a configured `ticketSecret` only
   * the `*` management wildcard may call.
   * @param request - identity, display text, and the entry-list YAML.
   * @returns once the preset is declared.
   * @throws {RemoteError} `gateway/bad-request` for a refused caller or unusable YAML, `agent-preset/invalid` for a deployment id.
   */
  @Remote('writeRaw')
  remoteExportWriteRaw(request: WriteRawPresetRequest): Promise<void> {
    return this.serial(async () => {
      const secret = this.spec.ticketSecret
      if (secret !== undefined && currentTicketUserId(secret) !== '*') {
        throw badRequest('raw compositions are administered by the management plane')
      }
      requireName(request.name)
      await this.assertWritable(request.agentPreset)
      let plugins: PresetRow[]
      try {
        plugins = parseRows(request.content)
      } catch (error: unknown) {
        throw badRequest(`content is not a composition: ${(error as Error).message}`)
      }
      await this.store(definitionOf(request.agentPreset, request.name, request.description, plugins))
    })
  }

  /**
   * Rewrite one stored preset's display text; the id never changes.
   * @param request - identity and the new display text.
   * @returns once the redeclared preset is active.
   * @throws {RemoteError} `agent-preset/invalid` for a preset this service does not store.
   */
  @Remote('rename')
  remoteExportRename(request: RenamePresetRequest): Promise<void> {
    return this.serial(async () => {
      requireName(request.name)
      const current = this.stored.get(request.agentPreset)
      if (current === undefined) throw invalid(request.agentPreset, 'only stored presets can be renamed')
      await this.store({
        ...current,
        name: request.name,
        ...request.description === undefined ? {} : { description: request.description },
      })
    })
  }

  /**
   * Offer or withhold one preset for new sessions; covers deployment presets too.
   * @param agentPreset - the preset id.
   * @param active - whether the management plane offers it.
   * @returns once the flag is stored.
   * @throws {RemoteError} `agent-preset/not-found` for an unknown id.
   */
  @Remote('setActive')
  remoteExportSetActive(agentPreset: string, active: boolean): Promise<void> {
    return this.serial(async () => {
      const ids = await this.rosterIds()
      if (!ids.has(agentPreset)) {
        throw new RemoteError('agent-preset/not-found', `Unknown agent preset: ${agentPreset}`,
          { agentPreset, available: [...ids] })
      }
      if (active) this.disabled.delete(agentPreset)
      else this.disabled.add(agentPreset)
      await writeDisabled(this.spec.root, this.disabled)
    })
  }

  /**
   * The tools the default preset registers, for authoring pickers.
   * @returns one entry per visible tool of the default preset's current revision.
   */
  @Remote('toolCatalog')
  async remoteExportToolCatalog(): Promise<MtilPresetToolCatalog> {
    await using lease = await this.ctx.agentPresets.acquireScope()
    return { tools: this.ctx.tools.schemas(lease.key).map(schema => ({ name: schema.name, description: schema.description })) }
  }
}

export default MtilPresets
