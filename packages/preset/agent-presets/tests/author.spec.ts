/**
 * The composition generator's Odoo connection block: an authored preset may
 * mount `apps/odoo-mcp` under its own Odoo account, and the free-form fields
 * a management plane supplies must never break the generated YAML.
 */
import { describe, expect, it } from 'vitest'
import { generateComposition, type AuthorOdooSpec } from '../src/author.ts'
import { load as loadYaml } from 'js-yaml'

const BASE = [
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '  config:',
  '    text: >-',
  '      base persona',
  '',
  '- id: tool-read',
  "  name: '@deepseek-ai/dsh-tool-read'",
  '',
].join('\n')

const ODOO: AuthorOdooSpec = {
  url: 'https://mtil.mtil.vn',
  db: 'mtil',
  user: 'ai-ketoan',
  apiKey: "mat'khau",
  serverPath: '/srv/harness/apps/odoo-mcp/server.mjs',
}

/** The generated `mcp-odoo` row, parsed back from the composition. */
function odooRowOf(text: string): Record<string, unknown> {
  const rows = loadYaml(text) as { id: string; config?: Record<string, unknown> }[]
  const row = rows.find(candidate => candidate.id === 'mcp-odoo')
  expect(row).toBeDefined()
  return row?.config as Record<string, unknown>
}

describe('authoring an Odoo connection', () => {
  it('appends a read-only mcp-odoo row with the account in env', () => {
    const text = generateComposition(BASE, { kind: 'standalone', persona: 'p', odoo: ODOO })

    const config = odooRowOf(text)
    expect(config.command).toBe('node')
    expect(config.args).toEqual(['/srv/harness/apps/odoo-mcp/server.mjs'])
    expect(config.env).toEqual({
      ODOO_URL: 'https://mtil.mtil.vn',
      ODOO_DB: 'mtil',
      ODOO_USER: 'ai-ketoan',
      ODOO_API_KEY: "mat'khau",
    })
  })

  it('adds the write switch, allowlist, and row cap only when given', () => {
    const text = generateComposition(BASE, {
      kind: 'standalone',
      persona: 'p',
      odoo: { ...ODOO, allowWrite: true, allowedModels: ['res.partner', 'account.move'], maxRows: 50 },
    })

    const env = odooRowOf(text).env as Record<string, string>
    expect(env.ODOO_ALLOW_WRITE).toBe('1')
    expect(env.ODOO_ALLOWED_MODELS).toBe('res.partner,account.move')
    expect(env.ODOO_MAX_ROWS).toBe('50')
  })

  it('emits no mcp-odoo row without an odoo spec', () => {
    const text = generateComposition(BASE, { kind: 'standalone', persona: 'p' })

    expect(text).not.toContain('mcp-odoo')
  })

  it.each([
    ['a multi-line api key', { ...ODOO, apiKey: 'a\nODOO_URL: evil' }, /single line/],
    ['a non-http url', { ...ODOO, url: 'file:///etc/passwd' }, /http/],
    ['an empty db', { ...ODOO, db: ' ' }, /non-empty/],
    ['a YAML-shaped model name', { ...ODOO, allowedModels: ["x'\ny"] }, /must match/],
    ['a zero row cap', { ...ODOO, maxRows: 0 }, /positive integer/],
  ] as const)('refuses %s', (_label, odoo, message) => {
    expect(() => generateComposition(BASE, { kind: 'standalone', persona: 'p', odoo }))
      .toThrow(message)
  })
})
