/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-user-ticket`.
 * @module @deepseek-ai/dsh-user-ticket/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-user-ticket'

/** Cordis companion plugin name. */
export const name = 'user-ticket-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a set of pure functions (sign/verify)
 * with no service, event stream, or mutable relation for a companion to
 * compare — verification is a total function of its inputs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
