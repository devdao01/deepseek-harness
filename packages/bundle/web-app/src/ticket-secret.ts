/**
 * Opt-in per-user ticket auth for the web deployment. Unlike the mandatory API
 * token, ticket auth is OFF by default: it turns on only when the operator
 * exports `DSH_TICKET_SECRET` (the HMAC secret shared with the Odoo minter).
 * The secret is never generated or persisted here — it must match Odoo's — so
 * resolution is a single validated env read: absent/empty ⇒ ticket auth stays
 * off (and the standalone same-origin SPA keeps working token-less, byte-for-
 * byte); present-but-short ⇒ fail loud.
 * @module @deepseek-ai/dsh-web-app/ticket-secret
 */

/** Environment variable carrying the shared HMAC ticket secret; unset ⇒ ticket auth off. */
export const DSH_TICKET_SECRET_ENV = 'DSH_TICKET_SECRET'

/** Minimum accepted secret length, mirroring `MIN_TICKET_SECRET_LENGTH` in `dsh-user-ticket`. */
export const MIN_WEB_TICKET_SECRET_LENGTH = 32

/**
 * Resolve the optional ticket secret from the environment.
 * @param env - the process environment (injected for tests).
 * @returns the secret when set and valid, or undefined when ticket auth is off.
 * @throws Error when the variable is set but shorter than {@link MIN_WEB_TICKET_SECRET_LENGTH}.
 */
export function resolveWebTicketSecret(env: NodeJS.ProcessEnv): string | undefined {
  const secret = env[DSH_TICKET_SECRET_ENV]
  if (secret === undefined || secret === '') return undefined
  if (secret.length < MIN_WEB_TICKET_SECRET_LENGTH) {
    throw new Error(
      `web-app: ${DSH_TICKET_SECRET_ENV} must be at least ${String(MIN_WEB_TICKET_SECRET_LENGTH)} characters`,
    )
  }
  return secret
}
