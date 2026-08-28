/**
 * Wire types for the `skillAuthoring` Remote namespace: workspace-addressed
 * management of one skill file's frontmatter and body. Kept free of runtime code
 * so both the Host service and the generated Remote client import them.
 *
 * @module @deepseek-ai/dsh-api-skill-controller/types
 */

/** One authored skill row of `skillAuthoring.listWorkspace`. */
export interface SkillEntry {
  /** Kebab-case identifier (the skill directory name). */
  readonly name: string
  /** Short routing description from the file's frontmatter. */
  readonly description: string
  /** Optional extra routing guidance from the file's frontmatter. */
  readonly whenToUse?: string
  /** Always `true`: an authored file carries no invocation policy. */
  readonly modelInvocable: boolean
}

/** Value of `skillAuthoring.listWorkspace`. */
export interface SkillListValue {
  readonly skills: readonly SkillEntry[]
}

/** Frontmatter fields and body returned by `skillAuthoring.read`. */
export interface SkillContent {
  readonly description: string
  readonly whenToUse?: string
  /** The skill body (everything after the frontmatter block). */
  readonly content: string
}

/** Value of `skillAuthoring.write`: the written skill name. */
export interface SkillWriteValue {
  readonly name: string
}

/** Value of `skillAuthoring.remove`: whether a directory was removed. */
export interface SkillRemoveValue {
  readonly removed: boolean
}

/** Request for `skillAuthoring.listWorkspace`. */
export interface SkillWorkspaceListRequest {
  readonly workspaceId: string
}

/** Request for `skillAuthoring.read`. */
export interface SkillReadRequest {
  readonly workspaceId: string
  readonly name: string
}

/** Request for `skillAuthoring.write`. */
export interface SkillWriteRequest {
  readonly workspaceId: string
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly content: string
}

/** Request for `skillAuthoring.remove`. */
export interface SkillRemoveRequest {
  readonly workspaceId: string
  readonly name: string
}
