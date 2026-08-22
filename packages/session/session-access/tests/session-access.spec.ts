/**
 * Per-session access list over a real storage/domain composition: fail-closed
 * default, the token/ticket canRead matrix, whole-set replacement and revoke,
 * durable reconstruction after reopen, the change feed, and disposal.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
import type { ApiPrincipal } from '@deepseek-ai/dsh-user-ticket'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import SessionAccessService from '../src/index.ts'

const SESSION = SessionId('s-1')
const ALICE = UserId('alice')
const BOB = UserId('bob')
const TOKEN: ApiPrincipal = { kind: 'token' }
const ticket = (userId: UserId): ApiPrincipal => ({ kind: 'ticket', userId })

/** Boot the real storage → storage-domain → session-access composition over an in-memory medium. */
async function harness(pool: MemoryMediaPool = new MemoryMediaPool()) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const changes: DomainChanged[] = []
  ctx.on('domain/changed', (change) => { changes.push(change) })
  const fiber = await ctx.plugin(SessionAccessService)
  return { ctx, fiber, pool, access: ctx.sessionAccess, changes }
}

describe('SessionAccessService', () => {
  it('returns an empty set for a session with no record (fail-closed)', async () => {
    const { access } = await harness()
    expect([...access.get(SESSION)]).toEqual([])
  })

  it('stores and reads back a deduplicated allowed-user set', async () => {
    const { access } = await harness()
    await access.set(SESSION, [ALICE, BOB, ALICE])
    expect([...access.get(SESSION)].sort()).toEqual(['alice', 'bob'])
  })

  it('returns a fresh copy callers cannot use to mutate the store', async () => {
    const { access } = await harness()
    await access.set(SESSION, [ALICE])
    const first = access.get(SESSION) as Set<UserId>
    first.add(BOB)
    expect([...access.get(SESSION)]).toEqual([ALICE])
  })

  it('emits a domain/changed put on set', async () => {
    const { access, changes } = await harness()
    await access.set(SESSION, [ALICE])
    expect(changes).toEqual([
      { domain: 'session_access', table: 'access', key: SESSION, operation: 'put', value: { userIds: [ALICE] } },
    ])
  })

  it('removes the row and emits a delete when set to an empty set', async () => {
    const { access, changes } = await harness()
    await access.set(SESSION, [ALICE])
    changes.length = 0
    await access.set(SESSION, [])
    expect([...access.get(SESSION)]).toEqual([])
    expect(changes).toEqual([{ domain: 'session_access', table: 'access', key: SESSION, operation: 'deleted' }])
  })

  it('does nothing durable when clearing an already-absent record', async () => {
    const { access, changes } = await harness()
    await access.set(SESSION, [])
    expect(changes).toEqual([])
  })

  describe('canRead', () => {
    it('always admits a full token, even with no record', async () => {
      const { access } = await harness()
      expect(access.canRead(TOKEN, SESSION)).toBe(true)
    })

    it('admits a ticket user who is an explicit member', async () => {
      const { access } = await harness()
      await access.set(SESSION, [ALICE])
      expect(access.canRead(ticket(ALICE), SESSION)).toBe(true)
    })

    it('denies a ticket user who is not a member', async () => {
      const { access } = await harness()
      await access.set(SESSION, [ALICE])
      expect(access.canRead(ticket(BOB), SESSION)).toBe(false)
    })

    it('denies every ticket user for a session with no record', async () => {
      const { access } = await harness()
      expect(access.canRead(ticket(ALICE), SESSION)).toBe(false)
    })

    it('denies a revoked ticket user after the set is emptied', async () => {
      const { access } = await harness()
      await access.set(SESSION, [ALICE])
      await access.set(SESSION, [])
      expect(access.canRead(ticket(ALICE), SESSION)).toBe(false)
    })
  })

  it('reconstructs the current set after a reopen on the same medium', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    await first.access.set(SESSION, [ALICE, BOB])
    await first.fiber.dispose()

    const second = await harness(pool)
    expect([...second.access.get(SESSION)].sort()).toEqual(['alice', 'bob'])
    expect(second.access.canRead(ticket(ALICE), SESSION)).toBe(true)
  })

  describe('onChanged', () => {
    it('fires with the session id after a write and stops after disposal', async () => {
      const { access } = await harness()
      const seen: SessionId[] = []
      const dispose = access.onChanged((sessionId) => { seen.push(sessionId) })
      await access.set(SESSION, [ALICE])
      await access.set(SESSION, [])
      dispose()
      await access.set(SESSION, [BOB])
      expect(seen).toEqual([SESSION, SESSION])
    })
  })

  it('closes its domain on fiber disposal so a fresh service can reopen it', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    await first.access.set(SESSION, [ALICE])
    await first.fiber.dispose()
    // A single-open domain would reject the second open with `already-open`;
    // reaching a usable service proves the first disposal closed the domain.
    const second = await harness(pool)
    expect(second.access.canRead(ticket(ALICE), SESSION)).toBe(true)
  })
})
