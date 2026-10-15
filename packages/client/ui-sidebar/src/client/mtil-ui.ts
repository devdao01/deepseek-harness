/**
 * MTIL frontend flags: the standalone MTIL SPA sets `globalThis.__MTIL_UI__`
 * before any bundle executes; the harness-served original never does, so the
 * sidebar keeps its stock New Session behavior.
 */
import type { SidebarRootInjected } from './contract/slots.ts'

/** The `__MTIL_UI__` flags this package reads. */
interface MtilUiFlags {
  /** The expanded brand returns to the no-Session welcome instead of starting a Session. */
  readonly brandClearsSession?: boolean
  /** Withhold the New Session button (Odoo creates Sessions). */
  readonly hideNewSession?: boolean
}

/**
 * The sidebar injection members the MTIL flags add.
 * @param clearSession - returns the main column to its no-Session state.
 * @returns `exitSession` and `hideNewSession` when the SPA set the matching flags, otherwise nothing.
 */
export function mtilSidebarInjected(
  clearSession: () => void,
): Pick<SidebarRootInjected, 'exitSession' | 'hideNewSession'> {
  const flags = (globalThis as { __MTIL_UI__?: MtilUiFlags }).__MTIL_UI__ ?? {}
  return {
    ...flags.brandClearsSession === true ? { exitSession: clearSession } : {},
    ...flags.hideNewSession === true ? { hideNewSession: true } : {},
  }
}
