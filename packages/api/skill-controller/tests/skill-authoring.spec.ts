/**
 * The pure `skill-authoring` layer over a real temp workspace directory: the
 * frontmatter format round-trip, the write→read→list→remove lifecycle, and the
 * name-safety and containment guards. The Remote controller wiring is covered by
 * the real-composition suite; here the filesystem logic stands alone.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SKILL_CONTENT_MAX_BYTES,
  SkillAuthoringError,
  assembleSkillFile,
  listWorkspaceSkills,
  parseSkillFile,
  readSkill,
  removeSkill,
  writeSkill,
} from '../src/skill-authoring.ts'

function workspace(): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-skill-controller-')))
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code })
}

describe('skill-authoring format', () => {
  it('round-trips description, whenToUse, and body', () => {
    const file = assembleSkillFile({
      name: 'commit-helper',
      description: 'Writes commits: with a colon',
      whenToUse: 'when "quoting" is tricky',
      content: '# Body\n\nSteps here.\n',
    })
    expect(file.startsWith('---\n')).toBe(true)
    expect(parseSkillFile(file)).toEqual({
      description: 'Writes commits: with a colon',
      whenToUse: 'when "quoting" is tricky',
      content: '# Body\n\nSteps here.\n',
    })
  })

  it('omits whenToUse when absent', () => {
    const file = assembleSkillFile({ name: 'plain', description: 'x', content: 'body' })
    expect(file).not.toContain('whenToUse')
    expect(parseSkillFile(file)).toEqual({ description: 'x', content: 'body' })
  })
})

describe('skill-authoring lifecycle', () => {
  it('writes, reads back, lists, and removes', async () => {
    const root = workspace()
    await writeSkill(root, { name: 'zebra', description: 'last', content: 'z' })
    await writeSkill(root, { name: 'alpha', description: 'first', whenToUse: 'sometimes', content: 'a' })

    expect(await readSkill(root, 'alpha')).toEqual({ description: 'first', whenToUse: 'sometimes', content: 'a' })

    // listWorkspaceSkills enumerates frontmatter, sorted by name.
    expect(await listWorkspaceSkills(root)).toEqual([
      { name: 'alpha', description: 'first', whenToUse: 'sometimes' },
      { name: 'zebra', description: 'last' },
    ])

    expect(await removeSkill(root, 'alpha')).toEqual({ removed: true })
    expect(await removeSkill(root, 'alpha')).toEqual({ removed: false })
    await expectCode(readSkill(root, 'alpha'), 'skill-not-found')
  })

  it('returns an empty list for a workspace with no skills', async () => {
    expect(await listWorkspaceSkills(workspace())).toEqual([])
  })

  it('rejects traversal and invalid names', async () => {
    const root = workspace()
    for (const name of ['../evil', '..', '.', 'a/b', 'Bad Name']) {
      await expectCode(readSkill(root, name), 'skill-invalid-name')
    }
  })

  it('refuses a body larger than the fixed bound', async () => {
    const root = workspace()
    await expectCode(
      writeSkill(root, { name: 'huge', description: 'd', content: 'a'.repeat(SKILL_CONTENT_MAX_BYTES + 1) }),
      'skill-too-large',
    )
    await writeSkill(root, { name: 'huge', description: 'd', content: 'a'.repeat(SKILL_CONTENT_MAX_BYTES) })
    expect((await readSkill(root, 'huge')).content.length).toBe(SKILL_CONTENT_MAX_BYTES)
  })

  it('refuses a skill directory symlinked outside the workspace', async () => {
    const root = workspace()
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-skill-outside-')))
    const skillsRoot = join(root, '.agents', 'skills')
    mkdirSync(skillsRoot, { recursive: true })
    symlinkSync(outside, join(skillsRoot, 'escape'))

    await expectCode(readSkill(root, 'escape'), 'forbidden')
    expect(existsSync(outside)).toBe(true)
    expect(new SkillAuthoringError('forbidden', 'x').code).toBe('forbidden')
  })
})
