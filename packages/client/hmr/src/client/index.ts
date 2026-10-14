/** Web SSE transport for page-owned client entry reconciliation and rebuilt code replacement. */
import type { Context } from '@deepseek-ai/cordis'
import type { PluginsEventParseResult } from '../events.ts'
import { EVENTS_ROUTE, parsePluginsEventFrame } from '../events.ts'

export type { PluginsEventFrame } from '../events.ts'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required service: the client module system whose entry controller handles received frames. */
export const inject = ['modules']

/**
 * Forward graph snapshots and rebuilds to the page's shared serial controller.
 * @param ctx - Plugin context with the client module system.
 */
export function apply(ctx: Context): void {
  const entries = ctx.modules.entries
  const handle = (frame: Extract<PluginsEventParseResult, { kind: 'frame' }>['frame']): void => {
    const run = frame.type === 'graph'
      ? Promise.resolve().then(() => entries.sync(frame.graph))
      : entries.reload(frame.id, frame.rev)
    void run.catch((error: unknown) => { ctx.logger.error(error) })
  }

  ctx.effect(() => {
    // A sub-path deployment (the MTIL SPA) publishes its absolute app base,
    // since its document URL is a client route rather than the app root.
    const appBase = (globalThis as { __DSH_APP_BASE__?: string }).__DSH_APP_BASE__
    const source = new EventSource(appBase === undefined
      ? EVENTS_ROUTE
      : new URL(EVENTS_ROUTE, appBase.endsWith('/') ? appBase : `${appBase}/`).href)
    source.addEventListener('message', (event: MessageEvent<string>) => {
      let value: unknown
      try {
        value = JSON.parse(event.data) as unknown
      } catch {
        // Wire boundary: a malformed transport frame is dropped loudly.
        ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`)
        return
      }
      const parsed = parsePluginsEventFrame(value)
      if (parsed.kind === 'invalid') {
        ctx.logger.warn(`client-hmr: invalid event frame: ${event.data}`)
      } else if (parsed.kind === 'frame') {
        handle(parsed.frame)
      }
    })
    return () => { source.close() }
  }, 'client-hmr: event source')
}
