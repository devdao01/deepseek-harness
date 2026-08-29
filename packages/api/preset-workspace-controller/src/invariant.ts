/** Package-owned invariant companion. @module @deepseek-ai/dsh-api-preset-workspace-controller/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-api-preset-workspace-controller'

/** Cordis companion plugin name. */
export const name = 'api-preset-workspace-controller-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the preset roster owns the compositions and the
 * workspace registry owns the workspaces, each with its own invariants. This
 * controller only projects their operations onto the wire and links a preset to
 * its workspace by a pure conventional path, owning no durable relationship of
 * its own to assert.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
