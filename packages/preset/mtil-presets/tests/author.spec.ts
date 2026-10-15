import { describe, expect, it } from 'vitest'
import { generateComposition, validateAuthorSpec, type PresetRow } from '../src/author.ts'

const BASE: PresetRow[] = [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'stock', suffix: 'cwd' } },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
  { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh' },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'delegation', name: 'group', group: true, config: [] },
  { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web' },
]

const ids = (rows: readonly PresetRow[]): (string | undefined)[] => rows.map(row => row.id)

describe('generateComposition', () => {
  it('replaces the persona and drops withheld capabilities for a standalone agent', () => {
    const rows = generateComposition(BASE, { kind: 'standalone', persona: 'Kế toán' })
    expect(ids(rows)).toEqual(['persona', 'tool-fs'])
    expect(rows[0]).toEqual({ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Kế toán' } })
  })

  it('keeps granted capabilities and prepends a persona to a base without one', () => {
    const rows = generateComposition(BASE.slice(1), { kind: 'standalone', persona: 'p', allowBash: true, allowWeb: true })
    expect(ids(rows)).toEqual(['persona', 'tool-bash', 'tool-pwsh', 'tool-fs', 'tool-web'])
  })

  it('appends one department row per router subagent and an Odoo connection row', () => {
    const rows = generateComposition(BASE, {
      kind: 'router',
      persona: 'router',
      subagents: [
        { toolName: 'hr', persona: 'HR', allowBash: true },
        { toolName: 'sales', persona: 'Sales', tools: ['read', 'read'] },
      ],
      odoo: {
        url: 'https://odoo.example', db: 'db', user: 'ai', apiKey: 'key', allowWrite: true,
        allowedModels: ['res.partner'], maxRows: 50, toolPrefix: 'erp', serverPath: '/srv/server.mjs',
      },
    })
    expect(ids(rows)).toEqual(['persona', 'tool-fs', 'delegation', 'tool-subagent-hr', 'tool-subagent-sales', 'mcp-odoo'])
    const hr = rows[3]?.config as { toolFilter: { allow: string[] } }
    expect(hr.toolFilter.allow.slice(0, 2)).toEqual(['bash', 'read'])
    expect((rows[4]?.config as { toolFilter: { allow: string[] } }).toolFilter.allow).toEqual(['read'])
    expect(rows[5]?.config).toEqual({
      serverName: 'erp', transport: 'stdio', command: 'node', args: ['/srv/server.mjs'],
      env: {
        ODOO_TOOL_PREFIX: 'erp', ODOO_URL: 'https://odoo.example', ODOO_DB: 'db', ODOO_USER: 'ai', ODOO_API_KEY: 'key',
        ODOO_ALLOW_WRITE: '1', ODOO_ALLOWED_MODELS: 'res.partner', ODOO_MAX_ROWS: '50',
      },
    })
  })

  it('writes the default Odoo keyword without a prefix variable', () => {
    const rows = generateComposition([], {
      kind: 'standalone', persona: 'p',
      odoo: { url: 'http://o', db: 'd', user: 'u', apiKey: 'k', serverPath: '/s' },
    })
    expect(rows.at(-1)?.config).toMatchObject({ serverName: 'odoo', env: { ODOO_URL: 'http://o' } })
    expect(Object.keys((rows.at(-1)?.config as { env: object }).env)).not.toContain('ODOO_TOOL_PREFIX')
  })
})

describe('validateAuthorSpec', () => {
  const odoo = { url: 'https://o', db: 'd', user: 'u', apiKey: 'k', serverPath: '/s' }
  it.each([
    [{ kind: 'standalone', persona: ' ' }, /persona/],
    [{ kind: 'router', persona: 'p', subagents: [] }, /at least one subagent/],
    [{ kind: 'router', persona: 'p', subagents: [{ toolName: 'Bad', persona: 'x' }] }, /toolName/],
    [{ kind: 'router', persona: 'p', subagents: [{ toolName: 'a', persona: 'x' }, { toolName: 'a', persona: 'y' }] }, /duplicated/],
    [{ kind: 'router', persona: 'p', subagents: [{ toolName: 'a', persona: ' ' }] }, /needs a persona/],
    [{ kind: 'router', persona: 'p', subagents: [{ toolName: 'a', persona: 'x', tools: ['a b'] }] }, /granted tool/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, db: '' } }, /odoo.db/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, user: 'a\nb' } }, /single line/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, url: 'ftp://o' } }, /http/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, allowedModels: ['Res Partner'] } }, /model name/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, maxRows: 0 } }, /maxRows/],
    [{ kind: 'standalone', persona: 'p', odoo: { ...odoo, toolPrefix: 'Bad Prefix' } }, /toolPrefix/],
  ] as const)('refuses %j', (spec, message) => {
    expect(() => { validateAuthorSpec(spec) }).toThrow(message)
  })
})
