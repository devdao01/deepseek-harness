/**
 * Pure preset-conventional path rules: root resolution (default, `~/` expansion,
 * absolute pass-through, relative rejection), id safety, and id→directory
 * mapping. Full branch coverage here keeps the controller test focused on the
 * provision/rollback behavior over a real workspace registry.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESET_WORKSPACES_DIRNAME,
  isPresetWorkspaceIdSafe,
  presetWorkspacePath,
  resolvePresetWorkspacesRoot,
} from '../src/preset-workspace.ts'

describe('resolvePresetWorkspacesRoot', () => {
  it('defaults an absent value to <home>/workspace', () => {
    expect(resolvePresetWorkspacesRoot(undefined, '/home/u'))
      .toBe(join('/home/u', DEFAULT_PRESET_WORKSPACES_DIRNAME))
  })

  it('expands a ~/-prefixed value against the home directory', () => {
    expect(resolvePresetWorkspacesRoot('~/ws/presets', '/home/u')).toBe('/home/u/ws/presets')
  })

  it('passes an absolute value through unchanged', () => {
    expect(resolvePresetWorkspacesRoot('/srv/workspaces', '/home/u')).toBe('/srv/workspaces')
  })

  it('rejects a relative value at load', () => {
    expect(() => resolvePresetWorkspacesRoot('workspaces', '/home/u')).toThrow(/absolute path or start with/)
  })

  it('anchors the default at the real home directory', () => {
    expect(resolvePresetWorkspacesRoot(undefined, homedir()))
      .toBe(join(homedir(), DEFAULT_PRESET_WORKSPACES_DIRNAME))
  })
})

describe('isPresetWorkspaceIdSafe', () => {
  it('accepts a plain single-segment id', () => {
    expect(isPresetWorkspaceIdSafe('accounting')).toBe(true)
  })

  it('rejects an empty id', () => {
    expect(isPresetWorkspaceIdSafe('')).toBe(false)
  })

  it('rejects a forward-slash separator', () => {
    expect(isPresetWorkspaceIdSafe('a/b')).toBe(false)
  })

  it('rejects a backslash separator', () => {
    expect(isPresetWorkspaceIdSafe('a\\b')).toBe(false)
  })

  it('rejects a single-dot segment', () => {
    expect(isPresetWorkspaceIdSafe('.')).toBe(false)
  })

  it('rejects a parent-dir segment', () => {
    expect(isPresetWorkspaceIdSafe('..')).toBe(false)
  })
})

describe('presetWorkspacePath', () => {
  it('joins the preset id under the root', () => {
    expect(presetWorkspacePath('/srv/ws', 'accounting')).toBe(join('/srv/ws', 'accounting'))
  })
})
