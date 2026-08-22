/**
 * Server side of the fetch carrier: maps an ApiProxy onto a pure
 * WHATWG Request->Response function. Two-level parse: full form (type/rpcId/method +
 * path==method) -> payload dispatched per method. HTTP status expresses only the carrier
 * (404 unknown path / 415 non-JSON media type / 400 non-JSON body / 500 handler crash);
 * business errors are always 200 + ServerResponse.
 */

import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import type { ApiProxy, MuxFrame, HostFrame } from '../api/index.ts'
import { sessionLogQuerySchema, workspaceFileQuerySchema } from '../api/downloads.schema.ts'
import { accessGetRequestSchema, accessSetRequestSchema } from '../api/access.schema.ts'
import type { RequestPayload, ResponseValue, RpcMethodMap } from '../api/rpc-map.ts'
import type { ClientRequest, RpcError, RpcRequest, RpcResponse, ServerRequest, ServerResponse } from '../api/rpc.ts'
import { RpcId } from '../api/rpc.ts'
import type { Wire } from '../api/rpc.schema.ts'
import { clientRequestSchema, clientResponseSchema } from '../api/rpc.schema.ts'
import {
  sessionCancelRequestSchema,
  sessionAttachmentRequestSchema,
  sessionCreateRequestSchema,
  sessionForkRequestSchema,
  sessionHistoryRequestSchema,
  sessionListRequestSchema,
  sessionModelsRequestSchema,
  sessionPromptRequestSchema,
  sessionRenameRequestSchema,
  sessionSearchRequestSchema,
  sessionSelectModelRequestSchema,
  sessionUpdateQueueRequestSchema,
} from '../api/sessions.schema.ts'
import {
  hostCreateDirectoryRequestSchema, hostDescribeRequestSchema,
  hostListDirectoryRequestSchema, hostOpenPathRequestSchema,
  hostPickDirectoryRequestSchema,
} from '../api/host.schema.ts'
import {
  workspaceArchiveSessionRequestSchema,
  workspaceCreateRequestSchema,
  workspaceDeleteRequestSchema,
  workspaceInsertBeforeRequestSchema,
  workspaceInsertSessionBeforeRequestSchema,
  workspaceListRequestSchema,
  workspaceRenameRequestSchema,
} from '../api/workspace.schema.ts'
import { skillListRequestSchema } from '../api/skills.schema.ts'
import {
  agentPresetCopyRequestSchema, agentPresetListRequestSchema, agentPresetOpenDocumentRequestSchema,
  agentPresetReadRequestSchema, agentPresetRemoveRequestSchema, agentPresetSelectRequestSchema,
  agentPresetUpdateRequestSchema,
} from '../api/agent-presets.schema.ts'
import {
  goalCreateRequestSchema,
  goalEditRequestSchema,
  goalPauseRequestSchema,
  goalResumeRequestSchema,
  goalCompleteRequestSchema,
  goalClearRequestSchema,
} from '../api/goals.schema.ts'
import {
  settingsDescribeRequestSchema, settingsMutateRequestSchema, settingsOpenDocumentRequestSchema,
  settingsReplaceRequestSchema, settingsUpdateRequestSchema,
} from '../api/settings.schema.ts'
import {
  credentialsDescribeRequestSchema, credentialsSetRequestSchema, credentialsUnsetRequestSchema,
} from '../api/credentials.schema.ts'
import { llmDiscoverModelsRequestSchema, llmModelsRequestSchema, llmProvidersRequestSchema } from '../api/llm.schema.ts'
import {
  subagentHistoryRequestSchema,
  subagentInterruptRequestSchema,
  subagentListRequestSchema,
  subagentPromptRequestSchema,
} from '../api/subagents.schema.ts'

/**
 * Unary dispatch table, keyed by (and compiler-locked to) RpcMethodMap: a map row without a
 * route row fails to compile, and each row's schema/invoke pair is checked against that row's
 * payload type — a schema pasted onto the wrong row is a type error, not a runtime surprise.
 * Schemas anchor to the Wire<> widening (the repo-wide exactOptionalPropertyTypes accommodation
 * documented on Wire); the dispatch point carries the one Wire→exact cast.
 * Every invoke receives the carrier Request's signal; routes whose contract
 * declares a signal parameter forward it, and the rest ignore it.
 */
type UnaryRoutes = {
  [K in keyof RpcMethodMap]: {
    schema: z.ZodType<Wire<RequestPayload<K>>>
    invoke(api: ApiProxy, request: RpcRequest<RequestPayload<K>>, signal: AbortSignal): Promise<RpcResponse<ResponseValue<K>>>
  }
}

const UNARY_ROUTES: UnaryRoutes = {
  'session.list': { schema: sessionListRequestSchema, invoke: (api, r) => api.sessions.list(r) },
  'session.search': { schema: sessionSearchRequestSchema, invoke: (api, r, signal) => api.sessions.search(r, signal) },
  'session.create': { schema: sessionCreateRequestSchema, invoke: (api, r) => api.sessions.create(r) },
  'session.history': { schema: sessionHistoryRequestSchema, invoke: (api, r) => api.sessions.history(r) },
  'session.models': { schema: sessionModelsRequestSchema, invoke: (api, r) => api.sessions.models(r) },
  'session.selectModel': { schema: sessionSelectModelRequestSchema, invoke: (api, r) => api.sessions.selectModel(r) },
  'session.rename': { schema: sessionRenameRequestSchema, invoke: (api, r) => api.sessions.rename(r) },
  'session.fork': { schema: sessionForkRequestSchema, invoke: (api, r) => api.sessions.fork(r) },
  'session.prompt': { schema: sessionPromptRequestSchema, invoke: (api, r) => api.sessions.prompt(r) },
  'session.attachment': { schema: sessionAttachmentRequestSchema, invoke: (api, r) => api.sessions.attachment(r) },
  'session.updateQueue': { schema: sessionUpdateQueueRequestSchema, invoke: (api, r) => api.sessions.updateQueue(r) },
  'session.cancel': { schema: sessionCancelRequestSchema, invoke: (api, r) => api.sessions.cancel(r) },
  'session.setAccess': { schema: accessSetRequestSchema, invoke: (api, r) => api.access ? api.access.setAccess(r) : Promise.resolve(accessUnavailableResponse(r.rpcId)) },
  'session.getAccess': { schema: accessGetRequestSchema, invoke: (api, r) => api.access ? api.access.getAccess(r) : Promise.resolve(accessUnavailableResponse(r.rpcId)) },
  'subagent.list': { schema: subagentListRequestSchema, invoke: (api, r, signal) => api.subagents.list(r, signal) },
  'subagent.history': { schema: subagentHistoryRequestSchema, invoke: (api, r, signal) => api.subagents.history(r, signal) },
  'subagent.prompt': { schema: subagentPromptRequestSchema, invoke: (api, r, signal) => api.subagents.prompt(r, signal) },
  'subagent.interrupt': { schema: subagentInterruptRequestSchema, invoke: (api, r) => api.subagents.interrupt(r) },
  'host.describe': { schema: hostDescribeRequestSchema, invoke: (api, r) => api.host.describe(r) },
  'host.pickDirectory': { schema: hostPickDirectoryRequestSchema, invoke: (api, r, signal) => api.host.pickDirectory(r, signal) },
  'host.listDirectory': { schema: hostListDirectoryRequestSchema, invoke: (api, r, signal) => api.host.listDirectory(r, signal) },
  'host.createDirectory': { schema: hostCreateDirectoryRequestSchema, invoke: (api, r) => api.host.createDirectory(r) },
  'host.openPath': { schema: hostOpenPathRequestSchema, invoke: (api, r, signal) => api.host.openPath(r, signal) },
  'workspace.list': { schema: workspaceListRequestSchema, invoke: (api, r) => api.workspace.list(r) },
  'workspace.create': { schema: workspaceCreateRequestSchema, invoke: (api, r) => api.workspace.create(r) },
  'workspace.rename': { schema: workspaceRenameRequestSchema, invoke: (api, r) => api.workspace.rename(r) },
  'workspace.delete': { schema: workspaceDeleteRequestSchema, invoke: (api, r) => api.workspace.delete(r) },
  'workspace.insertBefore': { schema: workspaceInsertBeforeRequestSchema, invoke: (api, r) => api.workspace.insertBefore(r) },
  'workspace.insertSessionBefore': { schema: workspaceInsertSessionBeforeRequestSchema, invoke: (api, r) => api.workspace.insertSessionBefore(r) },
  'workspace.archiveSession': { schema: workspaceArchiveSessionRequestSchema, invoke: (api, r) => api.workspace.archiveSession(r) },
  'skill.list': { schema: skillListRequestSchema, invoke: (api, r) => api.skills.list(r) },
  'agentPreset.list': { schema: agentPresetListRequestSchema, invoke: (api, r) => api.agentPresets.list(r) },
  'agentPreset.select': { schema: agentPresetSelectRequestSchema, invoke: (api, r) => api.agentPresets.select(r) },
  'agentPreset.read': { schema: agentPresetReadRequestSchema, invoke: (api, r) => api.agentPresets.read(r) },
  'agentPreset.copy': { schema: agentPresetCopyRequestSchema, invoke: (api, r) => api.agentPresets.copy(r) },
  'agentPreset.update': { schema: agentPresetUpdateRequestSchema, invoke: (api, r) => api.agentPresets.update(r) },
  'agentPreset.openDocument': { schema: agentPresetOpenDocumentRequestSchema, invoke: (api, r, signal) => api.agentPresets.openDocument(r, signal) },
  'agentPreset.remove': { schema: agentPresetRemoveRequestSchema, invoke: (api, r) => api.agentPresets.remove(r) },
  'goal.create': { schema: goalCreateRequestSchema, invoke: (api, r) => api.goals.create(r) },
  'goal.edit': { schema: goalEditRequestSchema, invoke: (api, r) => api.goals.edit(r) },
  'goal.pause': { schema: goalPauseRequestSchema, invoke: (api, r) => api.goals.pause(r) },
  'goal.resume': { schema: goalResumeRequestSchema, invoke: (api, r) => api.goals.resume(r) },
  'goal.complete': { schema: goalCompleteRequestSchema, invoke: (api, r) => api.goals.complete(r) },
  'goal.clear': { schema: goalClearRequestSchema, invoke: (api, r) => api.goals.clear(r) },
  'settings.describe': { schema: settingsDescribeRequestSchema, invoke: (api, r) => api.settings.describe(r) },
  'settings.openDocument': { schema: settingsOpenDocumentRequestSchema, invoke: (api, r, signal) => api.settings.openDocument(r, signal) },
  'settings.update': { schema: settingsUpdateRequestSchema, invoke: (api, r) => api.settings.update(r) },
  'settings.replace': { schema: settingsReplaceRequestSchema, invoke: (api, r) => api.settings.replace(r) },
  'settings.mutate': { schema: settingsMutateRequestSchema, invoke: (api, r) => api.settings.mutate(r) },
  'credentials.describe': { schema: credentialsDescribeRequestSchema, invoke: (api, r) => api.credentials.describe(r) },
  'credentials.set': { schema: credentialsSetRequestSchema, invoke: (api, r) => api.credentials.set(r) },
  'credentials.unset': { schema: credentialsUnsetRequestSchema, invoke: (api, r) => api.credentials.unset(r) },
  'llm.providers': { schema: llmProvidersRequestSchema, invoke: (api, r) => api.llm.providers(r) },
  'llm.models': { schema: llmModelsRequestSchema, invoke: (api, r) => api.llm.models(r) },
  'llm.discoverModels': { schema: llmDiscoverModelsRequestSchema, invoke: (api, r, signal) => api.llm.discoverModels(r, signal) },
}

/** Route lookup that narrows an arbitrary path segment to a map key (single cast point for the string→key refinement). */
function methodFor(path: string): keyof RpcMethodMap | undefined {
  return Object.hasOwn(UNARY_ROUTES, path) ? path as keyof RpcMethodMap : undefined
}

/**
 * Sentinel rpcId for error responses to envelopes whose own rpcId is unreadable: the response
 * must still be a valid ServerResponse (a self-violating shape would turn the server's explicit
 * bad-request report into a client-side parse failure). Fixed value, documented here as wire contract.
 */
const INVALID_REQUEST_RPC_ID = RpcId('invalid-request')

/**
 * Methods only a full token may call; a per-user ticket is refused at dispatch.
 * Two classes: per-session access management (a user cannot edit its own
 * access), and workspace mutation (registering a host directory, or renaming,
 * deleting, reordering, and archiving within the shared workspace roster is
 * deployment management the Odoo/MTIL front owns — a ticket only READS the
 * roster via `workspace.list`). The `workspace.file` download stays reachable,
 * gated by its session id like any session-scoped read.
 */
const FULL_TOKEN_ONLY: ReadonlySet<string> = new Set([
  'session.setAccess',
  'session.getAccess',
  'workspace.create',
  'workspace.rename',
  'workspace.delete',
  'workspace.insertBefore',
  'workspace.insertSessionBefore',
  'workspace.archiveSession',
])

/**
 * The session a request scopes to for the per-user access gate, or undefined
 * when the method is not session-scoped. Shared by the unary dispatch and the
 * remote-gateway carrier so one gate covers both. Reads, in order: the unary
 * payload's `sessionId`; a subagent method's `parentSessionId` (a child is
 * reachable through its parent); and the remote-gateway wire shapes
 * `args.agentId` (which IS a session id) and `args.request.sessionId`.
 * @param payload - the unary business payload, or a remote-gateway `{ args }` payload.
 * @returns the session id the call scopes to, or undefined when none is present.
 */
export function sessionScopeOf(payload: unknown): SessionId | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as { sessionId?: unknown; parentSessionId?: unknown; args?: unknown }
  if (typeof record.sessionId === 'string') return record.sessionId as SessionId
  if (typeof record.parentSessionId === 'string') return record.parentSessionId as SessionId
  if (typeof record.args === 'object' && record.args !== null) {
    const args = record.args as { agentId?: unknown; request?: unknown }
    if (typeof args.agentId === 'string') return args.agentId as SessionId
    if (typeof args.request === 'object' && args.request !== null) {
      const request = args.request as { sessionId?: unknown }
      if (typeof request.sessionId === 'string') return request.sessionId as SessionId
    }
  }
  return undefined
}

/** Whether a principal may reach a session-scoped operation; a full token always may. */
function principalMayReach(api: ApiProxy, principal: ApiPrincipal, sessionId: SessionId): boolean {
  if (principal.kind === 'token') return true
  return api.access?.canRead(principal, sessionId) ?? false
}

/**
 * Drop list rows a per-user principal may not read. `session.list` and
 * `session.search` enumerate sessions, so a ticket caller sees only its own;
 * a full token sees everything unchanged.
 */
function filterListForPrincipal(
  method: keyof RpcMethodMap,
  principal: ApiPrincipal,
  api: ApiProxy,
  response: RpcResponse<unknown>,
): RpcResponse<unknown> {
  if (principal.kind === 'token' || !response.result.ok) return response
  if (method !== 'session.list' && method !== 'session.search') return response
  const value = response.result.value as { items: { sessionId: SessionId }[] }
  const items = value.items.filter(item => principalMayReach(api, principal, item.sessionId))
  return { rpcId: response.rpcId, result: { ok: true, value: { ...value, items } } }
}

/** Wrap a business error as a ServerResponse full form (rpcId backfilled; an unreadable rpcId uses the invalid-request sentinel). */
function errorResponse(rpcId: RpcId, error: RpcError): Response {
  const body: ServerResponse = { type: 'server-response', rpcId, result: { ok: false, error } }
  return Response.json(body)
}

/** Complete the impl's narrow form into a ServerResponse full form. */
function fullResponse(narrow: RpcResponse<unknown>): Response {
  const body: ServerResponse = { type: 'server-response', rpcId: narrow.rpcId, result: narrow.result }
  return Response.json(body)
}

/** 403 refusal: a valid ticket lacking access to a session, or a full-token-only method. */
function forbiddenResponse(rpcId: RpcId, sessionId?: SessionId): Response {
  return errorResponse(rpcId, {
    code: 'forbidden',
    message: sessionId === undefined ? 'not authorized for this method' : `not authorized for session ${sessionId}`,
    details: sessionId === undefined ? {} : { sessionId },
  })
}

/** The internal error a management method answers when no access seam is composed. */
function accessUnavailableResponse(rpcId: RpcId): RpcResponse<{ userIds: string[] }> {
  return {
    rpcId,
    result: { ok: false, error: { code: 'internal', message: 'per-session access is unavailable', details: {} } },
  }
}

/**
 * Parse the payload and invoke one unary route. Generic over the map key so
 * the row's schema/invoke pairing typechecks; the only cast collapses the
 * Wire<> widening back to the exact payload (undefined-valued properties and
 * absent ones are indistinguishable after JSON transport).
 */
// K appears once in the signature but ties the UNARY_ROUTES[K] row lookup to its own
// schema/invoke pairing; a union parameter degrades the row to an uninvokable intersection.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
async function handleUnary<K extends keyof RpcMethodMap>(
  api: ApiProxy, method: K, message: ClientRequest, signal: AbortSignal, principal: ApiPrincipal,
): Promise<Response> {
  const route = UNARY_ROUTES[method]
  // An anonymous (credential-less, ticket-configured) caller is denied every
  // method: the reachability lane grants no access without a real credential.
  if (principal.kind === 'anonymous') return forbiddenResponse(message.rpcId)
  // Full-token-only management methods reject every per-user ticket up front,
  // before the payload is parsed — a forbidden caller learns nothing about the
  // method's schema.
  if (FULL_TOKEN_ONLY.has(method) && principal.kind !== 'token') {
    return forbiddenResponse(message.rpcId)
  }
  const payload = route.schema.safeParse(message.payload)
  if (!payload.success) {
    return errorResponse(message.rpcId, { code: 'bad-request', message: `invalid payload for ${method}`, details: { issues: payload.error.issues } })
  }
  // A session-scoped call from a ticket caller requires access to that session.
  const scoped = sessionScopeOf(payload.data)
  if (scoped !== undefined && !principalMayReach(api, principal, scoped)) {
    return forbiddenResponse(message.rpcId, scoped)
  }
  try {
    const response = await route.invoke(api, { rpcId: message.rpcId, payload: payload.data }, signal)
    return fullResponse(filterListForPrincipal(method, principal, api, response))
  } catch (error: unknown) {
    // The impl never throws business errors; reaching here means the implementation itself crashed — 500, carrier layer.
    return new Response(`handler failure: ${String(error)}`, { status: 500 })
  }
}

/** SSE frame: complete the narrow RpcRequest<frame> into a ServerRequest full form (method = frame type). */
function fullFrame(narrow: RpcRequest<MuxFrame | HostFrame>): ServerRequest {
  return { type: 'server-request', rpcId: narrow.rpcId, method: narrow.payload.type, payload: narrow.payload }
}

/**
 * Wrap a frame stream as an SSE Response; stops when req.signal aborts. An
 * impl throw mid-stream emits one stream/error frame and then closes.
 */
function sseResponse(frames: AsyncIterable<RpcRequest<MuxFrame | HostFrame>>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Send an SSE comment line on open so clients/proxies see a live channel (the host
        // stream has no baseline frames and would otherwise emit zero bytes while idle;
        // a comment line is not a frame, so client frame parsing skips it naturally).
        controller.enqueue(encoder.encode(': connected\n\n'))
        for await (const narrow of frames) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullFrame(narrow))}\n\n`))
        }
      } catch (error: unknown) {
        // Mid-stream impl failure → one stream/error frame, then close: the client must see
        // the failure instead of a silent end (which reads as a normal disconnect). A fresh
        // rpcId is minted — this is a server-initiated push like any other frame.
        const failure: MuxFrame | HostFrame = { type: 'stream/error', error: { code: 'internal', message: String(error), details: {} } }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullFrame({ rpcId: RpcId(randomUUID()), payload: failure }))}\n\n`))
        } catch {
          // Consumer already cancelled the stream: enqueue-after-cancel is the
          // only reachable error, and there is no one left to tell.
        }
      } finally {
        try {
          controller.close()
        } catch { /* already cancelled by the consumer: a double close is the only reachable error */ }
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  })
}

/**
 * Wraps an ApiProxy into a pure fetch function (isomorphic point: feed the returned fetch straight to InProcessApiClient).
 * @param api - the host-side ApiProxy implementation.
 * @returns an object holding `fetch(Request)`; paths outside /api/ return 404.
 */
export function toFetchHandler(api: ApiProxy, principal: ApiPrincipal = { kind: 'token' }): { fetch: typeof fetch } {
  return {
    // Signature matches global fetch: the isomorphic point hands this function to InProcessApiClient as its transport aspect,
    // Clients call in (url, init) form — normalize to Request before handling.
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const req = input instanceof Request ? input : new Request(input, init)
      const url = new URL(req.url)
      const path = url.pathname

      // No-envelope read channels (SSE GET streams + host-only download):
      // physical routes that answer directly, without a wire envelope. The
      // principal scopes stream delivery to the sessions its user may read.
      if (path === '/api/events.mux' && req.method === 'GET') {
        return sseResponse(api.events.mux({ rpcId: RpcId(randomUUID()), payload: {} }, req.signal, principal))
      }
      if (path === '/api/events.host' && req.method === 'GET') {
        return sseResponse(api.events.host({ rpcId: RpcId(randomUUID()), payload: {} }, req.signal, principal))
      }
      if (path === '/api/session.export' && (req.method === 'GET' || req.method === 'HEAD')) {
        // Query params are a different boundary from the POST envelope, but
        // the request still casts its brands only through the domain schema.
        const parsed = sessionLogQuerySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return new Response('missing or invalid sessionId query parameter', { status: 400 })
        }
        // A session download is session-scoped: a ticket caller needs access.
        if (!principalMayReach(api, principal, parsed.data.sessionId)) {
          return new Response('forbidden', { status: 403 })
        }
        const response = await api.downloads.sessionLog(parsed.data, req.signal)
        if (req.method === 'GET') return response
        await response.body?.cancel()
        return new Response(null, { status: response.status, headers: response.headers })
      }
      if (path === '/api/workspace.file' && (req.method === 'GET' || req.method === 'HEAD')) {
        const parsed = workspaceFileQuerySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return new Response('missing or invalid query parameters', { status: 400 })
        }
        // A workspace file read is scoped to its owning session.
        if (!principalMayReach(api, principal, parsed.data.sessionId)) {
          return new Response('forbidden', { status: 403 })
        }
        const response = await api.downloads.workspaceFile(parsed.data, req.signal)
        if (req.method === 'GET') return response
        await response.body?.cancel()
        return new Response(null, { status: response.status, headers: response.headers })
      }

      if (req.method !== 'POST' || !path.startsWith('/api/')) {
        return new Response('not found', { status: 404 })
      }

      // Cross-site write fence: browsers send "simple" POSTs (text/plain,
      // form encodings) without a CORS preflight, so a malicious page could
      // otherwise execute side-effectful RPCs blind — the response stays
      // unreadable cross-origin, but session.prompt would still run. Only the
      // JSON media type is accepted; anything else is forced into a preflight
      // this server never answers. 415 = carrier layer, like the 400 below.
      const mediaType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (mediaType !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 })
      }

      let body: unknown
      try {
        body = await req.json()
      } catch {
        // 400 = carrier layer (body is not even JSON); valid JSON with a bad shape goes 200 + bad-request.
        return new Response('body is not JSON', { status: 400 })
      }

      if (path === '/api/respond') {
        // An anonymous caller holds no pending server-request (it can open no
        // stream); refuse rather than let it answer another user's approval.
        if (principal.kind === 'anonymous') return Response.json({ accepted: false, reason: 'not-pending' })
        const parsed = clientResponseSchema.safeParse(body)
        if (!parsed.success) return Response.json({ accepted: false, reason: 'bad-response' })
        return Response.json(await api.respond(parsed.data))
      }

      const method = methodFor(path.slice('/api/'.length))
      if (method === undefined) return new Response('not found', { status: 404 })

      const envelope = clientRequestSchema.safeParse(body)
      if (!envelope.success) {
        // Best effort at correlation: salvage a string rpcId from the raw body;
        // otherwise the fixed sentinel keeps the response a valid ServerResponse.
        const rawId = (body as { rpcId?: unknown } | null)?.rpcId
        const rpcId = typeof rawId === 'string' ? RpcId(rawId) : INVALID_REQUEST_RPC_ID
        return errorResponse(rpcId, { code: 'bad-request', message: 'invalid client-request message', details: { issues: envelope.error.issues } })
      }
      const message: ClientRequest = envelope.data
      if (message.method !== method) {
        return errorResponse(message.rpcId, { code: 'bad-request', message: `method "${message.method}" does not match path "${method}"`, details: { issues: [] } })
      }
      return handleUnary(api, method, message, req.signal, principal)
    },
  }
}
