/** Client-safe payloads and event declarations owned by the agent-preset domain. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PresetTrust } from './preset.ts'

export type { PresetTrust } from './preset.ts'

/**
 * One roster row as a client reads it. Path-free: a preset is addressed by id
 * everywhere off the Host, and the composition's location is the Host's own.
 */
export interface AgentPresetRow {
  /** Stable identifier; also the label's fallback. */
  readonly id: string
  /** Trust of the root this preset was discovered under. */
  readonly trust: PresetTrust
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /**
   * Whether pickers offer this preset. A deactivated preset stays mounted for
   * the sessions already composed from it; only new selection is withheld.
   */
  readonly active: boolean
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** One department subagent of an authored router preset, as the wire carries it. */
export interface AuthorPresetSubagent {
  /** Tool name the router calls (lowercase slug; also the department identity). */
  readonly toolName: string
  /** Child persona: role, duties, and the skills it owns. */
  readonly persona: string
  /** Whether the child may run shell commands. */
  readonly allowBash?: boolean
  /** Whether the child may search/fetch the web. */
  readonly allowWeb?: boolean
  /**
   * Explicit tool grant (names per {@link AgentPresetToolCatalog}); present,
   * it replaces the flag-derived allow list.
   */
  readonly tools?: readonly string[]
}

/** Request creating or rewriting one structured locally authored preset. */
export interface AuthorPresetRequest {
  /** The preset id (directory name); an existing user preset is rewritten. */
  readonly agentPreset: string
  /** Display name stored in the preset metadata. */
  readonly name: string
  /** Description stored in the preset metadata. */
  readonly description?: string
  /** `standalone` = one direct-chat agent; `router` delegates to `subagents`. */
  readonly kind: 'standalone' | 'router'
  /** The agent's own persona. */
  readonly persona: string
  /** Whether this agent may run shell commands. */
  readonly allowBash?: boolean
  /** Whether this agent may search/fetch the web. */
  readonly allowWeb?: boolean
  /** Router departments; required (non-empty) for `kind: 'router'`. */
  readonly subagents?: readonly AuthorPresetSubagent[]
}

/** One grantable tool as the authoring catalog lists it. */
export interface AgentPresetToolCatalogEntry {
  /** The tool name a `toolFilter.allow` entry grants. */
  readonly name: string
  /** The tool's model-facing description (may be long). */
  readonly description: string
}

/** The tools the deployment's default composition registers. */
export interface AgentPresetToolCatalog {
  /** One entry per visible tool, in registry order. */
  readonly tools: readonly AgentPresetToolCatalogEntry[]
}

/** Request replacing one user preset's raw composition (management plane only). */
export interface WriteRawPresetRequest {
  /** The preset id (directory name); an existing user preset is rewritten. */
  readonly agentPreset: string
  /** Display name stored in the preset metadata. */
  readonly name: string
  /** Description stored in the preset metadata. */
  readonly description?: string
  /** The complete `agent.cordis.yml` text. */
  readonly content: string
}

/** The roster one deployment currently supplies, with its authoring capability. */
export interface AgentPresetRoster {
  /** Every preset the configured roots supply, first-root-wins per id. */
  readonly presets: readonly AgentPresetRow[]
  /** Whether this deployment has a root locally authored presets go to. */
  readonly authorable: boolean
}

/** Stable details for agent-preset failures returned by the Remote namespace. */
export interface AgentPresetErrorDetailsMap {
  /** A required preset id is empty. */
  'bad-request': Record<never, never>
  /** No configured root supplies the requested id. */
  'agent-preset-not-found': { readonly agentPreset: string; readonly available: readonly string[] }
  /** The id is unusable, already taken, or its composition cannot be installed. */
  'agent-preset-invalid': { readonly agentPreset: string; readonly reason: string }
  /** The preset ships with the deployment and is not the user's to change. */
  'agent-preset-read-only': { readonly agentPreset: string; readonly reason: string }
  /** The session's conversation has started, so its composition is fixed. */
  'agent-preset-locked': { readonly sessionId: SessionId; readonly agentPreset: string }
  /** The preset operation failed without a caller-actionable classification. */
  internal: Record<never, never>
}

/** One agent-preset refusal as a client reads it. */
export type AgentPresetError = {
  [Code in keyof AgentPresetErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: AgentPresetErrorDetailsMap[Code]
  }
}[keyof AgentPresetErrorDetailsMap]

/** One preset's composition text beside the row it belongs to. */
export interface AgentPresetDocument {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** Trust of the root this preset was discovered under. */
  readonly trust: PresetTrust
  /** The composition exactly as stored. */
  readonly content: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    agentPreset: string | null
  }
  interface SessionProjectionMap {
    /** Preset the Session runs, or null when the deployment composes none. */
    agentPreset: string | null
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One session committed a different agent preset to its durable log.
     * Consumers invalidate only state derived from that session's composition.
     * @mode emit
     * @param sessionId - the session whose composition changed.
     * @param agentPreset - the preset recorded by the committed selection.
     */
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
    /**
     * One locally authored preset was stored on disk (the copy committed).
     * Consumers prepare per-preset resources — the session controller
     * materializes the preset's workspace directory when one is configured.
     * @mode emit
     * @param agentPreset - the id of the preset just authored.
     */
    'agent-preset/authored'(agentPreset: string): void
    /**
     * One preset's display name was rewritten (the id never changes).
     * Consumers retitle name-derived presentation — the session controller
     * retitles the preset's Workspace group when one is configured.
     * @mode emit
     * @param agentPreset - the id of the renamed preset.
     * @param name - the new display name.
     */
    'agent-preset/renamed'(agentPreset: string, name: string): void
  }
}

export {}
