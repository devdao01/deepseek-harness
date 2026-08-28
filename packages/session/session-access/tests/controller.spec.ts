/**
 * The operator `sessionAccess` Remote over a real access-list composition: the
 * operator (principal-less) sets and reads the allowed-user set; a ticket caller
 * is refused `forbidden`.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteFailure, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { RequestPrincipal } from '@deepseek-ai/dsh-client-connection'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import SessionAccessService from '../src/index.ts'
import SessionAccessController from '../src/controller.ts'

const SIGNAL = new AbortController().signal

interface PrincipalCell { value: RequestPrincipal | undefined }

async function harness(principal: PrincipalCell): Promise<SessionAccessController> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('requestPrincipal', { current: () => principal.value } as never)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  await ctx.plugin(SessionAccessService)
  return new SessionAccessController(ctx)
}

async function result<T>(operation: () => Promise<T> | T): Promise<RemoteResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof TypertRemoteFailure
        ? error.failure
        : { code: 'internal', message: String(error), details: {} },
    }
  }
}

describe('sessionAccess Remote (operator)', () => {
  it('set then get round-trips a deduplicated allowed-user set', async () => {
    const controller = await harness({ value: undefined })
    expect(await controller.set({ sessionId: 's-1', userIds: ['alice', 'bob', 'alice'] }, SIGNAL))
      .toEqual({ userIds: ['alice', 'bob'] })
    expect(controller.get({ sessionId: 's-1' }, SIGNAL)).toEqual({ userIds: ['alice', 'bob'] })
  })

  it('revokes access when set to an empty set', async () => {
    const controller = await harness({ value: undefined })
    await controller.set({ sessionId: 's-1', userIds: ['alice'] }, SIGNAL)
    expect(await controller.set({ sessionId: 's-1', userIds: [] }, SIGNAL)).toEqual({ userIds: [] })
    expect(controller.get({ sessionId: 's-1' }, SIGNAL)).toEqual({ userIds: [] })
  })

  it('refuses a ticket caller with forbidden on both set and get', async () => {
    const controller = await harness({ value: { userId: 'alice' } })
    expect(await result(() => controller.set({ sessionId: 's-1', userIds: ['alice'] }, SIGNAL)))
      .toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(await result(() => controller.get({ sessionId: 's-1' }, SIGNAL)))
      .toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
})
