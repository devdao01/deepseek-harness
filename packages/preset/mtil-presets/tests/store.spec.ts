import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseRows, readDisabled, readStoredPresets, removeStoredPreset, writeDisabled, writeStoredPreset,
} from '../src/store.ts'

const root = (): Promise<string> => mkdtemp(join(tmpdir(), 'mtil-store-'))

describe('preset storage', () => {
  it('round-trips rows and display text, keeping !!js expressions', async () => {
    const dir = await root()
    const plugins = parseRows("- id: tool\n  name: '@x/y'\n  disabled: !!js \"ctx.flag\"\n")
    await writeStoredPreset(dir, { id: 'a', name: 'A', description: 'Desc', order: 3, plugins })
    expect(await readFile(join(dir, 'a', 'agent.cordis.yml'), 'utf8')).toContain('!!js')
    expect(await readStoredPresets(dir)).toEqual([{ id: 'a', definition: { id: 'a', name: 'A', description: 'Desc', order: 3, plugins } }])
    await writeStoredPreset(dir, { id: 'a', plugins })
    expect(existsSync(join(dir, 'a', 'preset.yml'))).toBe(false)
    await removeStoredPreset(dir, 'a')
    expect(await readStoredPresets(dir)).toEqual([])
  })

  it('ignores display text that is not a usable map, and skips files and invalid ids', async () => {
    const dir = await root()
    for (const [id, metadata] of [['list', 'just text\n'], ['blank', 'name: " "\norder: x\n']] as const) {
      await mkdir(join(dir, id))
      await writeFile(join(dir, id, 'agent.cordis.yml'), '[]\n')
      await writeFile(join(dir, id, 'preset.yml'), metadata)
    }
    await mkdir(join(dir, 'Not An Id'))
    await writeFile(join(dir, 'file'), '')
    expect((await readStoredPresets(dir)).map(preset => 'definition' in preset ? preset.definition : preset))
      .toEqual([{ id: 'blank', plugins: [] }, { id: 'list', plugins: [] }])
  })

  it('reads a missing root as empty and refuses a root that is not a directory', async () => {
    const dir = await root()
    expect(await readStoredPresets(join(dir, 'missing'))).toEqual([])
    await writeFile(join(dir, 'plain'), '')
    await expect(readStoredPresets(join(dir, 'plain'))).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it('stores the deactivated ids and reads malformed rosters as empty', async () => {
    const dir = await root()
    expect(await readDisabled(dir)).toEqual(new Set())
    await writeDisabled(dir, new Set(['b', 'a']))
    expect(JSON.parse(await readFile(join(dir, '.mtil-roster.json'), 'utf8'))).toEqual({ disabled: ['a', 'b'] })
    expect(await readDisabled(dir)).toEqual(new Set(['a', 'b']))
    await writeFile(join(dir, '.mtil-roster.json'), '{"disabled": ["a", 1]}')
    expect(await readDisabled(dir)).toEqual(new Set(['a']))
    await writeFile(join(dir, '.mtil-roster.json'), 'null')
    expect(await readDisabled(dir)).toEqual(new Set())
  })
})
