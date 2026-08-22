/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-access`.
 * @module @deepseek-ai/dsh-session-access/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-access'

/** Cordis companion plugin name. */
export const name = 'session-access-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the service keeps no derived cache — reads resolve
 * straight from the storage-domain table it opens, and that domain's own
 * integrity (record schema, write-chain order) is asserted by storage-domain.
 * This package adds no independent event stream or mutable relation to check.
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
