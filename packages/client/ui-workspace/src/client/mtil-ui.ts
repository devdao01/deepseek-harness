/**
 * MTIL frontend flags: the standalone MTIL SPA sets `globalThis.__MTIL_UI__`
 * before any bundle executes; the harness-served original never does, so
 * every flag reads as absent and the stock behavior applies.
 */
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'

/** The `__MTIL_UI__` flags this package reads. */
interface MtilUiFlags {
  /** Withhold every new-session affordance (Odoo creates Sessions). */
  readonly hideNewSession?: boolean
  /** Withhold the header's Add-workspace button. */
  readonly hideAddWorkspace?: boolean
  /** Withhold the Workspace row's rename/delete menu. */
  readonly hideWorkspaceActions?: boolean
  /** Withhold the Session row's menu and its title double-click rename. */
  readonly hideSessionActions?: boolean
  /** List a blank Session that carries a stored title like an ordinary row. */
  readonly showTitledBlanks?: boolean
}

/**
 * Read the MTIL frontend flags.
 * @returns the flags the SPA set, or none.
 */
export function mtilUi(): MtilUiFlags {
  return (globalThis as { __MTIL_UI__?: MtilUiFlags }).__MTIL_UI__ ?? {}
}

/**
 * Whether a blank Session is the provisional New Session placeholder. Under
 * `showTitledBlanks` a blank Session carrying a stored title was created
 * deliberately (by the Odoo management plane) and lists, titles, and
 * searches like an ordinary row.
 * @param session - the Session summary.
 * @returns true for a placeholder blank, false for an ordinary or titled-blank row.
 */
export function placeholderBlank(session: SessionSummary): boolean {
  return session.blank && !(mtilUi().showTitledBlanks === true && (session.title?.trim() ?? '') !== '')
}
