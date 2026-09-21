#!/usr/bin/env node
/**
 * MTIL MCP server (stdio, XML-RPC), read-only by default.
 *
 * Gives an agent four read tools over one MTIL account — `mtil_search_read`,
 * `mtil_read`, `mtil_search_count`, `mtil_fields_get` — and, only when
 * `MTIL_ALLOW_WRITE=1`, three write tools: `mtil_create`, `mtil_write`,
 * `mtil_unlink`. Without that flag the write tools are not listed and their
 * calls are refused, so a read-only preset cannot reach a write method at
 * all; arbitrary model methods are never reachable either way. MTIL's own
 * access rights and record rules apply on top per account — they are the
 * real boundary for what a write-enabled preset may touch.
 *
 * The whole configuration is environment, so one preset composition can mount
 * this server with its own MTIL account and another preset with a different
 * one:
 *
 *   MTIL_URL             https://mtil.mtil.vn        (required)
 *   MTIL_DB              the database name           (required)
 *   MTIL_USER            login of the AI account     (required)
 *   MTIL_API_KEY         that account's API key or password (required)
 *   MTIL_ALLOW_WRITE     '1'/'true' lists and permits create/write/unlink
 *   MTIL_ALLOWED_MODELS  comma-separated allowlist; empty = every model the
 *                        account may read
 *   MTIL_MAX_ROWS        hard cap per call (default 200)
 *
 * Dependency-free on purpose: it speaks MCP's newline-delimited JSON-RPC and
 * builds XML-RPC by hand, so deployment is `node server.mjs` with no install
 * step on the harness host.
 * @module apps/odoo-mcp/server
 */

import { createInterface } from 'node:readline'

const PROTOCOL_VERSION = '2024-11-05'
// The connection variables were renamed from ODOO_* to MTIL_*. A preset
// composition or overlay still carrying the old names would otherwise die on
// "MTIL_URL missing" with no hint of why; name the rename instead.
for (const suffix of ['URL', 'DB', 'USER', 'API_KEY', 'ALLOW_WRITE', 'ALLOWED_MODELS', 'MAX_ROWS', 'TOOL_PREFIX', 'BRAND']) {
  if (process.env[`ODOO_${suffix}`] !== undefined && process.env[`MTIL_${suffix}`] === undefined) {
    throw new Error(`odoo-mcp: ODOO_${suffix} was renamed to MTIL_${suffix}; update the preset composition or deployment overlay`)
  }
}
const ALLOW_WRITE = ['1', 'true', 'yes'].includes((process.env.MTIL_ALLOW_WRITE ?? '').toLowerCase())
// The keyword every tool name starts with (mtil_search_read -> erp_search_read
// under MTIL_TOOL_PREFIX=erp), so a deployment can brand the toolset.
const TOOL_PREFIX = process.env.MTIL_TOOL_PREFIX ?? 'mtil'
if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(TOOL_PREFIX)) {
  throw new Error(`odoo-mcp: MTIL_TOOL_PREFIX ${JSON.stringify(TOOL_PREFIX)} must be a short lowercase slug`)
}
// The system label the MODEL sees in descriptions and errors. A rebranded
// prefix rebrands the label too, so no model-visible string says "Odoo" —
// the model then has no ground to confirm what stands behind the tools.
const BRAND = process.env.MTIL_BRAND ?? (TOOL_PREFIX === 'mtil' ? 'MTIL' : TOOL_PREFIX.toUpperCase())
const MAX_ROWS = Math.max(1, Number(process.env.MTIL_MAX_ROWS ?? '200') || 200)
const ALLOWED_MODELS = (process.env.MTIL_ALLOWED_MODELS ?? '')
  .split(',').map(name => name.trim()).filter(name => name.length > 0)

/** Required connection settings, read once so a misconfiguration fails loudly. */
function connection() {
  const url = (process.env.MTIL_URL ?? '').replace(/\/+$/, '')
  const db = process.env.MTIL_DB ?? ''
  const user = process.env.MTIL_USER ?? ''
  const key = process.env.MTIL_API_KEY ?? ''
  const missing = [
    ...url === '' ? ['MTIL_URL'] : [],
    ...db === '' ? ['MTIL_DB'] : [],
    ...user === '' ? ['MTIL_USER'] : [],
    ...key === '' ? ['MTIL_API_KEY'] : [],
  ]
  if (missing.length > 0) throw new Error(`odoo-mcp: missing ${missing.join(', ')}`)
  return { url, db, user, key }
}

// ── XML-RPC ────────────────────────────────────────────────────────────────

/** Escape the five XML entities that can appear in a value. */
function xmlEscape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Serialize one JSON value as an XML-RPC `<value>`. */
function xmlValue(value) {
  if (value === null || value === undefined) return '<value><boolean>0</boolean></value>'
  if (typeof value === 'boolean') return `<value><boolean>${value ? 1 : 0}</boolean></value>`
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? `<value><int>${String(value)}</int></value>`
      : `<value><double>${String(value)}</double></value>`
  }
  if (typeof value === 'string') return `<value><string>${xmlEscape(value)}</string></value>`
  if (Array.isArray(value)) {
    return `<value><array><data>${value.map(xmlValue).join('')}</data></array></value>`
  }
  const members = Object.entries(value)
    .map(([name, member]) => `<member><name>${xmlEscape(name)}</name>${xmlValue(member)}</member>`)
    .join('')
  return `<value><struct>${members}</struct></value>`
}

/** One XML-RPC request document. */
function xmlRequest(method, params) {
  const body = params.map(param => `<param>${xmlValue(param)}</param>`).join('')
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${body}</params></methodCall>`
}

/** Cursor-based reader over the response text. */
class Cursor {
  constructor(text) {
    this.text = text
    this.at = 0
  }

  /** Advance past the next `<tag>`; returns the tag name, or undefined at the end. */
  nextTag() {
    const open = this.text.indexOf('<', this.at)
    if (open === -1) return undefined
    const close = this.text.indexOf('>', open)
    if (close === -1) return undefined
    this.at = close + 1
    return this.text.slice(open + 1, close)
  }

  /** Text up to the next `<`, entity-decoded. */
  textUntilTag() {
    const open = this.text.indexOf('<', this.at)
    const raw = this.text.slice(this.at, open === -1 ? undefined : open)
    this.at = open === -1 ? this.text.length : open
    return raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
      .replace(/&amp;/g, '&')
  }
}

/** Parse the value starting at the cursor (positioned just after `<value>`). */
function parseValue(cursor) {
  const tag = cursor.nextTag()
  if (tag === undefined) return null
  if (tag === '/value') return ''
  switch (tag) {
    case 'string': {
      const text = cursor.textUntilTag()
      cursor.nextTag()
      return text
    }
    case 'int':
    case 'i4': {
      const text = cursor.textUntilTag()
      cursor.nextTag()
      return Number.parseInt(text, 10)
    }
    case 'double': {
      const text = cursor.textUntilTag()
      cursor.nextTag()
      return Number.parseFloat(text)
    }
    case 'boolean': {
      const text = cursor.textUntilTag()
      cursor.nextTag()
      return text.trim() === '1'
    }
    case 'nil': {
      cursor.nextTag()
      return null
    }
    case 'dateTime.iso8601':
    case 'base64': {
      const text = cursor.textUntilTag()
      cursor.nextTag()
      return text
    }
    case 'array': {
      const items = []
      cursor.nextTag() // <data>
      for (;;) {
        const next = cursor.nextTag()
        if (next === undefined || next === '/data') break
        if (next === 'value') items.push(parseValue(cursor))
      }
      cursor.nextTag() // </array>
      return items
    }
    case 'struct': {
      const record = {}
      for (;;) {
        const next = cursor.nextTag()
        if (next === undefined || next === '/struct') break
        if (next !== 'member') continue
        cursor.nextTag() // <name>
        const name = cursor.textUntilTag()
        cursor.nextTag() // </name>
        const valueTag = cursor.nextTag() // <value>
        record[name] = valueTag === 'value' ? parseValue(cursor) : null
        cursor.nextTag() // </member>
      }
      return record
    }
    default: {
      // An untyped <value>text</value> is a string by the XML-RPC spec.
      const text = cursor.textUntilTag()
      return text
    }
  }
}

/** Parse one XML-RPC response into its single return value. */
function parseResponse(xml) {
  const faultAt = xml.indexOf('<fault>')
  const cursor = new Cursor(xml)
  cursor.at = xml.indexOf('<value>', faultAt === -1 ? 0 : faultAt)
  if (cursor.at === -1) throw new Error('odoo-mcp: malformed XML-RPC response')
  cursor.at += '<value>'.length
  const value = parseValue(cursor)
  if (faultAt !== -1) {
    let message = typeof value === 'object' && value !== null
      ? String(value.faultString ?? JSON.stringify(value))
      : String(value)
    // The backend's own fault text names its implementation (module paths
    // like odoo.exceptions.*); under a rebrand that would hand the model the
    // very word the deployment hides.
    if (BRAND !== 'Odoo') message = message.replace(/odoo/gi, BRAND)
    throw new Error(`${BRAND} refused the call: ${message}`)
  }
  return value
}

/** POST one XML-RPC call and return its value. */
async function xmlRpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: xmlRequest(method, params),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${BRAND} endpoint answered HTTP ${String(response.status)}: ${text.slice(0, 200)}`)
  }
  return parseResponse(text)
}

let cachedUid
/** Authenticate once per process; the uid rides every later call. */
async function uid(conn) {
  if (cachedUid !== undefined) return cachedUid
  const value = await xmlRpc(`${conn.url}/xmlrpc/2/common`, 'authenticate',
    [conn.db, conn.user, conn.key, {}])
  if (typeof value !== 'number' || value === 0 || Number.isNaN(value)) {
    throw new Error(`${BRAND} rejected the credentials (ask the administrator to check the connection settings)`)
  }
  cachedUid = value
  return value
}

/** Refuse a model outside the configured allowlist before any call is made. */
function assertModel(model) {
  if (typeof model !== 'string' || model.trim() === '') throw new Error('model is required')
  if (ALLOWED_MODELS.length > 0 && !ALLOWED_MODELS.includes(model)) {
    throw new Error(`model "${model}" is not allowed here; allowed: ${ALLOWED_MODELS.join(', ')}`)
  }
}

/** Run one read method through `execute_kw`. */
async function execute(model, method, args, kwargs) {
  const conn = connection()
  const userId = await uid(conn)
  return await xmlRpc(`${conn.url}/xmlrpc/2/object`, 'execute_kw',
    [conn.db, userId, conn.key, model, method, args, kwargs ?? {}])
}

// ── MCP tools ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: `${TOOL_PREFIX}_search_read`,
    description: `Search ${BRAND} records and read their fields in one call (read-only). `
      + 'Domain syntax example: [["state","=","sale"],["amount_total",">",1000]].',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: `${BRAND} data model, e.g. res.partner or sale.order` },
        domain: { type: 'array', description: 'Search domain; omit for all readable records', items: {} },
        fields: { type: 'array', description: 'Field names to read; omit for a small default set', items: { type: 'string' } },
        limit: { type: 'integer', description: `Maximum records (capped at ${String(MAX_ROWS)})` },
        offset: { type: 'integer', description: 'Records to skip, for paging' },
        order: { type: 'string', description: 'Sort clause, e.g. "date desc, id desc"' },
      },
      required: ['model'],
    },
    run: async (args) => {
      assertModel(args.model)
      const limit = Math.min(Number(args.limit ?? MAX_ROWS) || MAX_ROWS, MAX_ROWS)
      const kwargs = {
        limit,
        ...args.fields === undefined ? {} : { fields: args.fields },
        ...args.offset === undefined ? {} : { offset: Number(args.offset) },
        ...args.order === undefined ? {} : { order: String(args.order) },
      }
      return await execute(args.model, 'search_read', [args.domain ?? []], kwargs)
    },
  },
  {
    name: `${TOOL_PREFIX}_read`,
    description: `Read named fields of ${BRAND} records by id (read-only).`,
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        ids: { type: 'array', items: { type: 'integer' }, description: 'Record ids' },
        fields: { type: 'array', items: { type: 'string' } },
      },
      required: ['model', 'ids'],
    },
    run: async (args) => {
      assertModel(args.model)
      const ids = (args.ids ?? []).slice(0, MAX_ROWS).map(Number)
      return await execute(args.model, 'read', [ids],
        args.fields === undefined ? {} : { fields: args.fields })
    },
  },
  {
    name: `${TOOL_PREFIX}_search_count`,
    description: `Count ${BRAND} records matching a domain (read-only).`,
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        domain: { type: 'array', items: {} },
      },
      required: ['model'],
    },
    run: async (args) => {
      assertModel(args.model)
      return await execute(args.model, 'search_count', [args.domain ?? []], {})
    },
  },
  {
    name: `${TOOL_PREFIX}_fields_get`,
    description: 'Describe a model\'s fields (name, type, label, relation) so a query can be written correctly.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        attributes: {
          type: 'array', items: { type: 'string' },
          description: 'Field attributes to return; defaults to string/type/relation/required',
        },
      },
      required: ['model'],
    },
    run: async (args) => {
      assertModel(args.model)
      return await execute(args.model, 'fields_get', [],
        { attributes: args.attributes ?? ['string', 'type', 'relation', 'required', 'selection'] })
    },
  },
]

/** The write tools, listed and callable only under MTIL_ALLOW_WRITE. */
const WRITE_TOOLS = [
  {
    name: `${TOOL_PREFIX}_create`,
    description: `Create one ${BRAND} record and return its id. Relational fields take ids `
      + `(many2one: the id; many2many: [[6,0,[ids]]]). Check ${TOOL_PREFIX}_fields_get for required fields first.`,
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        values: { type: 'object', description: 'Field values for the new record' },
      },
      required: ['model', 'values'],
    },
    run: async (args) => {
      assertModel(args.model)
      if (typeof args.values !== 'object' || args.values === null || Array.isArray(args.values)) {
        throw new Error('values must be an object of field values')
      }
      return await execute(args.model, 'create', [args.values], {})
    },
  },
  {
    name: `${TOOL_PREFIX}_write`,
    description: `Update named fields on existing ${BRAND} records by id. Returns true on success.`,
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        ids: { type: 'array', items: { type: 'integer' }, description: 'Record ids to update' },
        values: { type: 'object', description: 'Field values to set on every listed record' },
      },
      required: ['model', 'ids', 'values'],
    },
    run: async (args) => {
      assertModel(args.model)
      const ids = requireIds(args.ids)
      if (typeof args.values !== 'object' || args.values === null || Array.isArray(args.values)) {
        throw new Error('values must be an object of field values')
      }
      return await execute(args.model, 'write', [ids, args.values], {})
    },
  },
  {
    name: `${TOOL_PREFIX}_unlink`,
    description: `Delete ${BRAND} records by id. Irreversible; returns true on success. `
      + `Prefer archiving (${TOOL_PREFIX}_write with {"active": false}) when the model has an active field.`,
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        ids: { type: 'array', items: { type: 'integer' }, description: 'Record ids to delete' },
      },
      required: ['model', 'ids'],
    },
    run: async (args) => {
      assertModel(args.model)
      return await execute(args.model, 'unlink', [requireIds(args.ids)], {})
    },
  },
]

/** Validate and bound a caller-supplied id list. */
function requireIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array of record ids')
  return ids.slice(0, MAX_ROWS).map(Number)
}

const ACTIVE_TOOLS = ALLOW_WRITE ? [...TOOLS, ...WRITE_TOOLS] : TOOLS

// ── MCP stdio loop ─────────────────────────────────────────────────────────

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function replyError(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

async function handle(request) {
  const { id, method, params } = request
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'odoo-mcp', version: '1.0.0' },
      })
      return
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return
    case 'ping':
      reply(id, {})
      return
    case 'tools/list':
      reply(id, {
        tools: ACTIVE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })
      return
    case 'tools/call': {
      const tool = ACTIVE_TOOLS.find(candidate => candidate.name === params?.name)
      if (tool === undefined) {
        replyError(id, `unknown tool "${String(params?.name)}"`)
        return
      }
      try {
        const value = await tool.run(params.arguments ?? {})
        reply(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
      } catch (error) {
        // A tool-level failure is reported as content the model can act on,
        // not as a protocol error that would tear the connection down.
        reply(id, {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        })
      }
      return
    }
    default:
      if (id !== undefined) replyError(id, `unsupported method "${String(method)}"`)
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const text = line.trim()
  if (text === '') return
  let request
  try {
    request = JSON.parse(text)
  } catch {
    // A non-JSON line cannot carry an id to answer; dropping it keeps the
    // stream usable for the next well-formed message.
    return
  }
  void handle(request).catch((error) => {
    if (request.id !== undefined) {
      replyError(request.id, error instanceof Error ? error.message : String(error))
    }
  })
})
