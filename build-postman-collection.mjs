#!/usr/bin/env node
/**
 * Generates a Postman Collection v2.1 (dsh-api.postman_collection.json) for the
 * DeepSeek Harness local backend API (packages/host/apiproxy + fetch carrier).
 *
 * Wire protocol (authoritative source: packages/host/apiproxy/src/api/*):
 *   - Unary RPC   : POST /api/<method>   body = ClientRequest envelope, Content-Type: application/json (else 415)
 *                   { "type": "client-request", "rpcId": "<uuid>", "method": "<method>", "payload": {...} }
 *                   Response = ServerResponse (business errors ride HTTP 200 with result.ok=false)
 *   - SSE streams : GET  /api/events.mux  |  GET /api/events.host   (no envelope; text/event-stream, each data line = ServerRequest)
 *   - Download    : GET  /api/session.export?sessionId=...&includeDescendants=true (ZIP; no envelope)
 *                   GET  /api/workspace.file?sessionId=...&path=...            (file attachment; no envelope)
 *   - Respond     : POST /api/respond     body = ClientResponse (answer to an approval/question ServerRequest)
 *
 * Run: node build-postman-collection.mjs
 */

import { writeFileSync } from 'node:fs'

const COLLECTION_FILE = 'dsh-api.postman_collection.json'

// ---------- small helpers ----------

/** Build the ClientRequest envelope body for an RPC method. */
function envelope(method, payload) {
  return {
    type: 'client-request',
    rpcId: '{{$guid}}',
    method,
    payload,
  }
}

/** A ServerResponse success body. */
function ok(value) {
  return { type: 'server-response', rpcId: '{{$guid}}', result: { ok: true, value } }
}

/** A ServerResponse business-error body (HTTP is still 200). */
function err() {
  return {
    type: 'server-response',
    rpcId: '{{$guid}}',
    result: { ok: false, error: { code: 'internal', message: '<error message>', details: {} } },
  }
}

/** Build a Postman URL object from a raw template like "{{baseUrl}}/api/x?a=1&b=2".
 * No `protocol` member: the base-URL variables already carry their scheme
 * (http://… / ws://…), and Postman would prepend a second one. */
function buildUrl(raw) {
  const m = raw.match(/^(\{\{[a-zA-Z]+\}\})\/?(.*)$/)
  const host = m ? [m[1]] : []
  let rest = m ? m[2] : raw
  let query
  const q = rest.indexOf('?')
  if (q !== -1) {
    query = rest
      .slice(q + 1)
      .split('&')
      .filter(Boolean)
      .map((kv) => {
        const eq = kv.indexOf('=')
        return eq === -1 ? { key: kv, value: '' } : { key: kv.slice(0, eq), value: kv.slice(eq + 1) }
      })
    rest = rest.slice(0, q)
  }
  const url = { raw, host, path: rest.split('/').filter(Boolean) }
  if (query) url.query = query
  return url
}

/** Request object (Postman item.request). */
function request(method, url, { body, description, headers = [{ key: 'Content-Type', value: 'application/json' }] } = {}) {
  const r = { method, header: headers, url: buildUrl(url) }
  if (description) r.description = description
  if (body !== undefined) {
    r.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    }
  }
  return r
}

/** Minimal response example entry. */
function responseExample(name, body, code = 200, status = 'OK') {
  return {
    name,
    originalRequest: { method: 'POST', url: { raw: '{{baseUrl}}/api/placeholder' } },
    status,
    code,
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: JSON.stringify(body, null, 2),
    _postman_previewlanguage: 'json',
  }
}

/** One unary RPC request item. */
function rpcItem(method, payloadExample, valueExample, description) {
  const url = `{{baseUrl}}/api/${method}`
  return {
    name: method,
    request: request('POST', url, {
      description,
      body: envelope(method, payloadExample),
    }),
    response: [responseExample('200 — Success (ServerResponse)', ok(valueExample)), responseExample('200 — Business error (RpcError)', err())],
  }
}

/** One GET (no envelope) item. */
function getItem(name, url, description) {
  return {
    name,
    request: request('GET', url, { description }),
    response: [],
  }
}

// ---------- method table ----------
// Each entry: [method, folder, payload example, value example, description]

const RPC = [
  // ---- sessions ----
  ['session.list', 'Sessions',
    {},
    { items: [{ sessionId: '<session-id>', updatedAt: 1724000000000, running: false, blank: true }] },
    'Lists persisted sessions (updatedAt descending). v1 returns everything; `cursor` is a reserved seat, unimplemented.'],
  ['session.search', 'Sessions',
    { query: 'deepseek harness' },
    { items: [{ sessionId: '<session-id>', snippet: '…matching snippet…' }], hasMore: false },
    'Searches the current user/assistant/steering message surface across sessions visible to `session.list`. Results: at most 20 sessions; `hasMore` asks the client to refine the query.'],
  ['session.create', 'Sessions',
    { cwd: '/Users/dev01/Desktop/test1' },
    { sessionId: '<new-session-id>' },
    'Creates a real session and its idle agent. At most ONE of `workspaceId` / `cwd` is accepted (both → bad-request). The project directory (cwd) resolves in order: named `workspaceId` → explicit `cwd` → when only `agentPreset` is given, that preset\'s stored `workspacePath` (else the conventional `<presetWorkspacesRoot>/<agentPreset>`) IF a workspace is registered there (never auto-created) → the Host cwd. A preset-conventional match attaches the session to that workspace. Optional `sessionId` preallocates an id (retry with same id+cwd → same session; different cwd → session-conflict). Optional `agentPreset` names the composition.'],
  ['session.history', 'Sessions',
    { sessionId: '{{sessionId}}', maxMessages: 50 },
    { events: [{ event: { type: 'user/message', seq: 1, time: 1724000000000, data: {} } }], hasMore: false },
    'Reads a window of history events; page boundaries align to append-origin message boundaries. `beforeSeq` pages backward (tail page when absent, and only the tail page may carry `projections`). Reading never resumes or publishes an Agent.'],
  ['session.models', 'Sessions',
    { sessionId: '{{sessionId}}' },
    { current: { provider: 'deepseek', model: 'deepseek-chat' }, routable: true, groups: [], failures: [] },
    'Reads a fresh advisory model directory for an ordinary session. `current` = the session\'s model selection; `routable` = whether an adapter currently serves it (a session cannot start a turn when false).'],
  ['session.selectModel', 'Sessions',
    { sessionId: '{{sessionId}}', provider: 'deepseek', model: 'deepseek-chat' },
    { selected: { provider: 'deepseek', model: 'deepseek-chat' } },
    'Selects the complete model selection for this session. Optional `reasoningEffort` is validated by the adapter.'],
  ['session.rename', 'Sessions',
    { sessionId: '{{sessionId}}', title: 'My session' },
    { title: 'My session', seq: 3 },
    'Renames a session: appends a `session/title` event (user source) which pins the title against automatic regeneration. A title that normalizes to empty fails with `title-invalid`.'],
  ['session.fork', 'Sessions',
    { sessionId: '{{sessionId}}' },
    { sessionId: '<forked-session-id>' },
    'Forks a new session from a completed-turn prefix of the source. `atSeq` anchors the cut (first `turn/end` at or after it); omitted → last completed turn. An in-log anchor whose turn is still open fails with `fork-unavailable`.'],
  ['session.prompt', 'Sessions',
    {
      sessionId: '{{sessionId}}',
      mode: 'queue',
      content: [{ type: 'text', text: 'Hello! Please list the files in this project.' }],
      clientTimeZone: 'Asia/Ho_Chi_Minh',
    },
    { accepted: true },
    'Sends a message to an ordinary session Agent after durable host admission. `mode`: queue→send, steer→steer. `content`: text and/or image parts (image = {mediaType, data(base64), name?}). A single text block starting with "/" dispatches a slash command instead (never sent to the model). Optional `clientTimeZone` is validated IANA zone recorded on that message.'],
  ['session.attachment', 'Sessions',
    { sessionId: '{{sessionId}}', attachmentId: '<attachment-id>' },
    { attachment: { attachmentId: '<attachment-id>', mediaType: 'image/png', bytes: 1234, width: 100, height: 100 }, data: '<base64>' },
    'Reads one durable image after proving that this session\'s log references its id. `attachmentId` comes from history events / prompt content.'],
  ['session.updateQueue', 'Sessions',
    { sessionId: '{{sessionId}}', itemId: '<message-id>', action: { kind: 'remove' } },
    { accepted: true },
    'Edits, removes, or strictly steers ONE pending queued occurrence on an ordinary session. `action`: {kind:"edit", content:[…]} | {kind:"remove"} | {kind:"steer"}. Unknown item → queue-item-not-found.'],
  ['session.cancel', 'Sessions',
    { sessionId: '{{sessionId}}' },
    { accepted: true },
    'Stops an ordinary session\'s active turn, preserving pending inbox work that resumes in FIFO order after cancellation settles.'],

  // ---- subagents ----
  ['subagent.list', 'Subagents',
    { parentSessionId: '{{parentSessionId}}' },
    { entries: [], parentAvailable: true },
    'Lists direct session-backed children of a parent session without loading either side. `parentAvailable` is a hint only.'],
  ['subagent.history', 'Subagents',
    { parentSessionId: '{{parentSessionId}}', childSessionId: '{{childSessionId}}', mode: 'one-shot', maxMessages: 50 },
    { events: [], hasMore: false },
    'Reads one healthy catalog child\'s transcript (in-memory snapshot of a live child, persisted log of a cold one) with message-aligned pagination — no Agent activation. `mode` must be `one-shot` or `continuable`.'],
  ['subagent.prompt', 'Subagents',
    {
      parentSessionId: '{{parentSessionId}}',
      childSessionId: '{{childSessionId}}',
      mode: 'continuable',
      content: [{ type: 'text', text: 'Continue with the next step.' }],
    },
    { messageId: '<accepted-message-id>' },
    'Delivers human content to a continuable child through the exact live parent\'s continuation owner. Success identifies the message accepted by the child\'s FIFO inbox.'],
  ['subagent.interrupt', 'Subagents',
    { parentSessionId: '{{parentSessionId}}', childSessionId: '{{childSessionId}}', mode: 'continuable' },
    { accepted: true },
    'Interrupts a live continuable child\'s current turn under the address\'s durable direct-parent authority. Fire-and-return: `accepted` acknowledges the admitted cancel signal, not target quiescence.'],

  // ---- host ----
  ['host.describe', 'Host',
    {},
    { version: '0.1.0', cwd: '/Users/dev01/Desktop/test1', provider: 'deepseek', model: 'deepseek-chat', attachedSessions: 1, canOpenPath: true },
    'One-shot host snapshot: version, cwd (root for persistence/tools), default provider/model, attachedSessions, canOpenPath.'],
  ['host.pickDirectory', 'Host',
    {},
    { path: '/Users/dev01/Desktop' },
    'Opens the OS single-directory picker; cancellation returns `null`. Only served under the `native` capability; otherwise directory-picker-unavailable.'],
  ['host.listDirectory', 'Host',
    {},
    { path: '/Users/dev01', home: '/Users/dev01', crumbs: [], entries: [], truncated: false },
    'Lists one directory level for the in-app browser; absent `path` lists the host account\'s home directory. Only served under the `browse` capability; unreadable/missing targets fail with directory-unreadable.'],
  ['host.createDirectory', 'Host',
    { path: '/Users/dev01/Desktop', name: 'new-folder' },
    { path: '/Users/dev01/Desktop/new-folder' },
    'Creates one child directory under an existing parent ("New folder"). Existing child → directory-exists; other FS failures → directory-create-failed.'],
  ['host.openPath', 'Host',
    { path: '/Users/dev01/Desktop/test1' },
    { opened: true },
    'Opens a filesystem path with the operating system\'s default application (Finder/Explorer/xdg-open hand-off).'],

  // ---- workspace ----
  ['workspace.list', 'Workspace',
    {},
    { items: [], archivedSessionIds: [] },
    'Lists all workspaces in the registry\'s durable display order, plus the registry-global archived-session set.'],
  ['workspace.create', 'Workspace',
    { path: '/Users/dev01/Desktop/test1' },
    { workspace: { workspaceId: '<workspace-id>', path: '/Users/dev01/Desktop/test1', title: 'test1', sessionIds: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }, created: true },
    'Creates (or idempotently resolves) a workspace over an EXISTING directory (no mkdir; missing/non-directory → workspace-invalid-path). Already-owned path returns that workspace with `created: false`.'],
  ['workspace.rename', 'Workspace',
    { workspaceId: '{{workspaceId}}', title: 'My Workspace' },
    { workspace: { workspaceId: '{{workspaceId}}', path: '/Users/dev01/Desktop/test1', title: 'My Workspace', sessionIds: [], createdAt: '', updatedAt: '' } },
    'Renames a workspace. `title` is trimmed and must be non-empty (schema-enforced); a title equal to another workspace\'s → workspace-name-conflict.'],
  ['workspace.delete', 'Workspace',
    { workspaceId: '{{workspaceId}}' },
    { deleted: true },
    'Removes one Workspace registration only — the directory, user files and session logs remain untouched; those sessions become ungrouped.'],
  ['workspace.insertBefore', 'Workspace',
    { workspaceId: '{{workspaceId}}' },
    { workspaceIds: [] },
    'Moves one Workspace within the registry display order (DOM-insertBefore-like); omitted `beforeWorkspaceId` appends to the end.'],
  ['workspace.insertSessionBefore', 'Workspace',
    { workspaceId: '{{workspaceId}}', sessionId: '{{sessionId}}' },
    { workspace: { workspaceId: '{{workspaceId}}', path: '/Users/dev01/Desktop/test1', title: 'test1', sessionIds: [], createdAt: '', updatedAt: '' } },
    'Moves an accounted session within its workspace\'s manual order; `beforeSessionId` inserts before the anchor, omitted appends. Unknown workspace → workspace-not-found; unknown session/anchor → workspace-move-invalid.'],
  ['workspace.archiveSession', 'Workspace',
    { sessionId: '{{sessionId}}' },
    { archivedSessionIds: [] },
    'Adds one session to the registry-global archive set (hidden from grouping surfaces, log + workspace slot kept). Idempotent. Returns the full updated set.'],

  // ---- skills ----
  ['skill.list', 'Skills',
    { sessionId: '{{sessionId}}' },
    { skills: [{ name: 'my-skill', description: 'Does something', whenToUse: 'When …', modelInvocable: true }] },
    'Lists the user-invocable skill catalog for the session\'s project (resolved from the session header cwd — the client never submits a path). Invocation itself is a plain `session.prompt` starting with "/name".'],

  // ---- agentPresets ----
  ['agentPreset.list', 'Agent Presets',
    {},
    { presets: [
      { id: 'base', trust: 'system', isDefault: true, name: 'Base' },
      { id: 'my-preset', trust: 'user', isDefault: false, name: 'My Preset', workspacePath: '/Users/dev01/workspace/my-preset' },
    ], authorable: true, hasDocument: true },
    'Lists every preset the deployment currently supplies, in root-precedence order. Each entry may carry `workspacePath` — the preset\'s stored conventional workspace directory, present on authored presets that were stamped at copy time (absent on shipped presets). `authorable` = whether a user root exists for copying; `hasDocument` = whether openDocument can hand a directory to a native opener.'],
  ['agentPreset.select', 'Agent Presets',
    { sessionId: '{{sessionId}}', agentPreset: 'base' },
    { agentPreset: 'base' },
    'Recomposes one session\'s agent from a different preset. Only allowed while the session is blank (no turn has run); otherwise agent-preset-locked.'],
  ['agentPreset.read', 'Agent Presets',
    { agentPreset: 'base' },
    { agentPreset: 'base', trust: 'system', content: '# composition text …', name: 'Base' },
    'Reads one preset\'s composition text for the read-only viewer. Privileged: a composition names the plugins a session runs (loopback-pinned).'],
  ['agentPreset.copy', 'Agent Presets',
    { from: 'base', agentPreset: 'my-preset', name: 'My Preset' },
    { agentPreset: 'my-preset', workspace: {
      workspaceId: '<workspace-id>', path: '/Users/dev01/workspace/my-preset', title: 'my-preset',
      sessionIds: [], createdAt: '2024-08-19T12:00:00.000Z', updatedAt: '2024-08-19T12:00:00.000Z',
    } },
    'Creates a locally authored preset by copying an existing one whole, then provisions its conventional default workspace (`<presetWorkspacesRoot>/<agentPreset>`, default root `~/workspace`) as ONE operation: the directory is created-or-adopted through the workspace registry, its canonical path is stamped onto the new preset\'s metadata (surfacing as `workspacePath` on agentPreset.list), and the response carries the `WorkspaceView`. Copy-only authoring: no composition text and no path crosses the wire. An id that is not a single path segment (separator or `..`) → agent-preset-invalid before anything is copied; if provisioning or the stamp fails, the just-copied preset is rolled back and the call answers directory-create-failed naming the path.'],
  ['agentPreset.openDocument', 'Agent Presets',
    { agentPreset: 'my-preset' },
    { opened: true },
    'Hands one locally authored preset\'s DIRECTORY to the platform opener (request carries an id, never a path). Shipped presets refused. No native opener → {opened:false, path}.'],
  ['agentPreset.remove', 'Agent Presets',
    { agentPreset: 'my-preset' },
    {},
    'Deletes a locally authored preset. Shipped presets are refused (agent-preset-read-only).'],

  // ---- goals ----
  ['goal.create', 'Goals',
    { sessionId: '{{sessionId}}', objective: 'Refactor the auth module and add tests.', maxGoalRounds: 3 },
    { ref: { id: '<goal-id>', revision: 1 } },
    'Creates and arms a goal for an ordinary session. The read side is the `goal` session projection; this mutation answers with the new CAS ref.'],
  ['goal.edit', 'Goals',
    { sessionId: '{{sessionId}}', ref: { id: '<goal-id>', revision: 1 }, objective: 'Refactor the auth module.', maxGoalRounds: 5 },
    { ref: { id: '<goal-id>', revision: 2 } },
    'Edits objective and/or round cap without changing phase. `ref` is the compare-and-set identity of the exact revision.'],
  ['goal.pause', 'Goals',
    { sessionId: '{{sessionId}}', ref: { id: '<goal-id>', revision: 2 } },
    { ref: { id: '<goal-id>', revision: 3 } },
    'Pauses an active goal and disarms automatic continuation.'],
  ['goal.resume', 'Goals',
    { sessionId: '{{sessionId}}', ref: { id: '<goal-id>', revision: 3 } },
    { ref: { id: '<goal-id>', revision: 4 } },
    'Resumes and arms a stopped goal.'],
  ['goal.complete', 'Goals',
    { sessionId: '{{sessionId}}', ref: { id: '<goal-id>', revision: 4 } },
    { ref: { id: '<goal-id>', revision: 5 } },
    'Marks a current non-complete goal complete and disarms it.'],
  ['goal.clear', 'Goals',
    { sessionId: '{{sessionId}}', ref: { id: '<goal-id>', revision: 5 } },
    { cleared: true },
    'Clears the current goal while retaining a durable tombstone and history.'],

  // ---- settings ----
  ['settings.describe', 'Settings',
    {},
    { writable: true, hasDocument: true, namespaces: [] },
    'Describes every registered settings namespace: redacted layered values (resolved/base/user), serialized schemastery schema, `secrets` slot list, revision, applies. Values are redacted — secret values never ride a response.'],
  ['settings.openDocument', 'Settings',
    {},
    { opened: true },
    'Materializes the configured local document when absent and asks the Host to hand it to the platform text-document opener. The request carries no path.'],
  ['settings.update', 'Settings',
    { ns: 'agent-default-model', patch: { provider: 'deepseek', model: 'deepseek-chat' }, expectedRevision: 1 },
    { ns: 'agent-default-model', schema: {}, value: { provider: 'deepseek', model: 'deepseek-chat' }, applies: 'live', secrets: [], revision: 2 },
    'Merges a patch into one namespace\'s user layer (validate → persist → commit). Secret-role fields may be included (write-only direction). Stale `expectedRevision` → settings-conflict with both revisions.'],
  ['settings.replace', 'Settings',
    { ns: 'agent-default-model', section: {} },
    { ns: 'agent-default-model', schema: {}, value: {}, applies: 'live', secrets: [], revision: 2 },
    'Replaces one namespace\'s user section wholesale — the removal/reset path a merge cannot express (`section: {}` resets to composition defaults). Keys absent from `section` are dropped, secrets included.'],
  ['settings.mutate', 'Settings',
    { ns: 'agent-default-model', ops: [{ op: 'set', path: ['provider'], value: 'deepseek' }, { op: 'unset', path: ['model'] }] },
    { ns: 'agent-default-model', schema: {}, value: { provider: 'deepseek' }, applies: 'live', secrets: [], revision: 2 },
    'Applies path-addressed edits to one namespace\'s user section, resolved against the section as stored (NOT against the caller\'s last read). `set` writes at the path, `unset` removes it; empty path addresses the section root.'],

  // ---- credentials ----
  ['credentials.describe', 'Credentials',
    { refs: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] },
    { credentials: { OPENAI_API_KEY: { configured: true, source: 'env', writable: false } } },
    'Describes the named references (batch): configured state, winning source, writability — NEVER values. An invalid reference name → bad-request; an unknown-but-valid one describes as unconfigured.'],
  ['credentials.set', 'Credentials',
    { ref: 'OPENAI_API_KEY', value: 'sk-…' },
    {},
    'Stores one credential value in the writable layer. Rejected (credential-rejected) while a read-only layer (e.g. the live environment) shadows the reference.'],
  ['credentials.unset', 'Credentials',
    { ref: 'OPENAI_API_KEY' },
    {},
    'Removes one credential from the writable layer; same shadowing rejection as `set`. Unsetting an absent reference succeeds (idempotent).'],

  // ---- llm ----
  ['llm.providers', 'LLM',
    {},
    { providers: [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true }] },
    'Lists every configurable provider with its live/dormant state, in directory declaration order.'],
  ['llm.models', 'LLM',
    {},
    { groups: [], failures: [] },
    'Host-scoped model catalog over every registered provider route (the settings surface\'s models view, needing no session). Per-provider failures ride `failures` without failing the sound groups.'],
  ['llm.discoverModels', 'LLM',
    { settingsNs: 'llm-openai', provider: 'openai', baseURL: 'https://api.openai.com/v1', api: 'chat/completions', apiKey: 'sk-…' },
    { models: [{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxTokens: 16384 }] },
    'Interrogates a provider endpoint the configuration surface is still drafting and returns the models it advertises. Nothing is written — the reply is candidates. `apiKey` is accepted here but never stored or returned.'],
]

// ---------- no-envelope stream/download endpoints ----------
// events.mux / events.host are WebSocket streams on the standard GUI (the connection
// plugin's downlink; plain HTTP GET answers "upgrade required"). The pure fetch carrier
// (toFetchHandler) also implements them as SSE GETs — usable in-process / custom carriers.
const STREAMS = [
  ['events.mux (WebSocket stream)', '{{wsBaseUrl}}/api/events.mux',
    'All-session aggregated mux stream. On the standard GUI this is a WebSocket downlink (ws://127.0.0.1:3080/api/events.mux); open it as a Postman WebSocket request and read the server frames. ' +
    'Each frame is a ServerRequest: session/event, session/subscribed, approval/requested, question/requested, session/queue, session/jobs, session/projection, stream/error, … On open it emits a subscribed control frame for every attached session, then replays pending approval/question frames.'],
  ['events.host (WebSocket stream)', '{{wsBaseUrl}}/api/events.host',
    'Host-level info stream (WebSocket downlink on the GUI; SSE GET in the pure fetch carrier). Frames: host/session-added, host/session-removed, host/session-status, host/agent-error, host/workspace-changed, host/workspace-removed, host/workspace-order-changed, host/archived-sessions-changed, host/remote-event, stream/error.'],
  ['session.export (ZIP download)', '{{baseUrl}}/api/session.export?sessionId={{sessionId}}&includeDescendants=true',
    'Streams one session-log ZIP — the root artifact verbatim plus each subagent descendant\'s — as an attachment response (also HEAD supported). No wire envelope. Missing services → 500; missing root session → 404.'],
  ['workspace.file (file download)', '{{baseUrl}}/api/workspace.file?sessionId={{sessionId}}&path=notes/report.md',
    'Streams ONE regular file from the session\'s workspace directory as an application/octet-stream attachment (content-length + content-disposition naming the basename, RFC 5987 for non-ASCII; also HEAD supported). No wire envelope. `path` is absolute or relative to the workspace. Containment is enforced by realpath\'ing both the workspace root and the requested file: a file resolving OUTSIDE the workspace → 403 (a symlink cannot escape). An executable artifact (extension in a fixed list — exe/dll/so/sh/py/jar/… — or a POSIX execute bit) → 403. Unknown session, missing file, or a non-regular file (directory, fifo) → 404.'],
]

// ---------- respond ----------
const RESPOND_BODY = {
  type: 'client-response',
  rpcId: '<rpcId echoed from the approval/question server-request frame>',
  result: {
    ok: true,
    value: {
      sessionId: '{{sessionId}}',
      answer: { answers: [{ id: '<question-id>', selected: ['<option-label>'] }] },
    },
  },
}

const RESPOND_ITEM = {
  name: 'respond',
  request: request('POST', '{{baseUrl}}/api/respond', {
    description:
      'Carries a ClientResponse answering an answerable ServerRequest (approval/requested or question/requested) received on the SSE stream. `rpcId` must echo the server request\'s rpcId — never minted anew. ' +
      'Approval value: { sessionId, approvalId, outcome: "allowed-once" | "rejected" }. ' +
      'Question value: { sessionId, answer: { answers: [{ id, selected: string[], custom? }] } }. ' +
      'The HTTP response body is the carrier receipt: { accepted: true } | { accepted: false, reason: "not-pending" | "bad-response" }.',
    body: RESPOND_BODY,
  }),
  response: [responseExample('200 — Receipt accepted', { accepted: true }), responseExample('200 — Receipt rejected', { accepted: false, reason: 'not-pending' })],
}

// ---------- assemble collection ----------
const folderOrder = ['Sessions', 'Subagents', 'Host', 'Workspace', 'Skills', 'Agent Presets', 'Goals', 'Settings', 'Credentials', 'LLM']

const folders = folderOrder.map((title) => {
  const items = RPC.filter(([, f]) => f === title).map(([method, , payload, value, description]) =>
    rpcItem(method, payload, value, description))
  return { name: title, item: items }
})

folders.push({
  name: 'Streams & Downloads (WebSocket / GET, no envelope)',
  item: STREAMS.map(([name, url, description]) => getItem(name, url, description)),
})
folders.push({
  name: 'Respond (POST /api/respond)',
  item: [RESPOND_ITEM],
})

const collection = {
  info: {
    name: 'DeepSeek Harness — Local Backend API',
    description:
      'DeepSeek Harness local backend API (packages/host/apiproxy + fetch carrier). ' +
      'The GUI you run (e.g. http://127.0.0.1:3080) serves these endpoints.\n\n' +
      '## Wire protocol\n' +
      '- **Unary RPC**: `POST /api/<method>` with `Content-Type: application/json` (anything else → HTTP 415). ' +
      'Body is the ClientRequest envelope: `{ "type": "client-request", "rpcId": "<uuid>", "method": "<method>", "payload": {…} }`. ' +
      '`rpcId` is any unique string you mint (this collection uses the Postman dynamic variable `{{$guid}}`); responses echo it.\n' +
      '- **Response**: ServerResponse envelope. **Business errors ride HTTP 200** with `result.ok === false` and `result.error = { code, message, details }`. ' +
      'HTTP status describes only the carrier: 404 unknown path, 415 non-JSON media type, 400 body not JSON, 500 handler crash.\n' +
      '- **Streams**: on the standard GUI, `GET /api/events.mux` and `GET /api/events.host` are **WebSocket** downlinks (`ws://127.0.0.1:3080/api/events.mux`) — open them as Postman WebSocket requests. A plain HTTP GET against the GUI answers "upgrade required"; the pure fetch carrier implements the SSE GET form instead.\n' +
      '- **Download**: `GET /api/session.export?sessionId=…&includeDescendants=…` streams a session-log ZIP, and `GET /api/workspace.file?sessionId=…&path=…` streams one contained workspace file as an attachment (both no envelope).\n' +
      '- **Respond**: `POST /api/respond` carries the ClientResponse answering an approval/question ServerRequest received on a stream.\n\n' +
      '## Variables\n' +
      '- `baseUrl` — default `http://127.0.0.1:3080` (the harness Web GUI address).\n' +
      '- `sessionId`, `workspaceId`, `parentSessionId`, `childSessionId` — fill them from the response of `session.list` / `workspace.list` / `subagent.list` (or use a Postman test script to persist values automatically).\n\n' +
      '## Notes\n' +
      '- Single-user local service: no auth. Loopback-only by default; some methods (settings/credentials/agentPreset authoring, host.openPath) are loopback-pinned by the carrier trust fence.\n' +
      '- Postman is not a browser, so no CORS applies.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://127.0.0.1:3080', type: 'string' },
    { key: 'wsBaseUrl', value: 'ws://127.0.0.1:3080', type: 'string' },
    { key: 'sessionId', value: '', type: 'string' },
    { key: 'workspaceId', value: '', type: 'string' },
    { key: 'parentSessionId', value: '', type: 'string' },
    { key: 'childSessionId', value: '', type: 'string' },
  ],
  item: folders,
}

writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2) + '\n')

// ---------- report ----------
const rpcCount = RPC.length
const totalRequests = folders.reduce((n, f) => n + f.item.length, 0)
console.log(`wrote ${COLLECTION_FILE}`)
console.log(`  RPC methods   : ${rpcCount}`)
console.log(`  streams/downloads: ${STREAMS.length}`)
console.log(`  respond        : 1`)
console.log(`  total requests : ${totalRequests} (in ${folders.length} folders)`)
