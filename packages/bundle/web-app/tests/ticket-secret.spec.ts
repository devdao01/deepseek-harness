/**
 * Opt-in ticket-secret resolution: unset/empty ⇒ ticket auth off (undefined),
 * present-but-short ⇒ fail loud, valid ⇒ the secret. Env-driven, never
 * generated or persisted.
 */

import { describe, expect, it } from 'vitest'
import {
  DSH_TICKET_SECRET_ENV,
  MIN_WEB_TICKET_SECRET_LENGTH,
  resolveWebTicketSecret,
} from '../src/ticket-secret.ts'

const GOOD = 's'.repeat(MIN_WEB_TICKET_SECRET_LENGTH)

describe('resolveWebTicketSecret', () => {
  it('is undefined (ticket auth off) when the variable is unset', () => {
    expect(resolveWebTicketSecret({})).toBeUndefined()
  })

  it('is undefined when the variable is set but empty', () => {
    expect(resolveWebTicketSecret({ [DSH_TICKET_SECRET_ENV]: '' })).toBeUndefined()
  })

  it('returns the secret when set and long enough', () => {
    expect(resolveWebTicketSecret({ [DSH_TICKET_SECRET_ENV]: GOOD })).toBe(GOOD)
  })

  it('fails loud when set but shorter than the minimum', () => {
    expect(() => resolveWebTicketSecret({ [DSH_TICKET_SECRET_ENV]: 's'.repeat(MIN_WEB_TICKET_SECRET_LENGTH - 1) }))
      .toThrow(/DSH_TICKET_SECRET must be at least 32 characters/)
  })
})
