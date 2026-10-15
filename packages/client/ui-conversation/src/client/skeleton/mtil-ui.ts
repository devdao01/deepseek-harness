/**
 * MTIL frontend `hideNewSession` flag: the standalone SPA lets Odoo create
 * every Session, so the Conversation hero offers no way to start one. The
 * harness-served original never sets the flag.
 */

/**
 * Whether the SPA withholds every new-session affordance.
 * @returns true when `__MTIL_UI__.hideNewSession` is set.
 */
export function mtilHidesNewSession(): boolean {
  return (globalThis as { __MTIL_UI__?: { hideNewSession?: boolean } }).__MTIL_UI__?.hideNewSession === true
}
