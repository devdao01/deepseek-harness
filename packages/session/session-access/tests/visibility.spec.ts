/**
 * The session-visibility filter binding the request principal to the access
 * list: the operator (principal-less) sees all; a ticket user sees only sessions
 * they are an explicit member of; the current principal is read per call.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { UserId } from '@deepseek-ai/dsh-user-ticket'
import type { RequestPrincipal } from '@deepseek-ai/dsh-client-connection'
import type { SessionVisibility } from '@deepseek-ai/dsh-api-session-controller'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import SessionAccessService from '../src/index.ts'
import * as visibilityPlugin from '../src/visibility.ts'

const SESSION = SessionId('s-1')
const ALICE = UserId('alice')

/** A mutable request-principal cell standing in for Connection's ALS-backed store. */
interface PrincipalCell { value: RequestPrincipal | undefined }

async function harness(principal: PrincipalCell): Promise<{
  access: SessionAccessService
  visibility: SessionVisibility
}> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('requestPrincipal', { current: () => principal.value } as never)
  await ctx.plugin(SessionAccessService)
  await ctx.plugin(visibilityPlugin)
  const visibility = ctx.get('sessionVisibility')
  if (visibility === undefined) throw new Error('sessionVisibility was not provided')
  return { access: ctx.sessionAccess, visibility }
}

describe('session-access visibility', () => {
  it('sees every session for the operator (principal-less), even with no record', async () => {
    const { visibility } = await harness({ value: undefined })
    expect(visibility.canSee(SESSION)).toBe(true)
  })

  it('sees only a session the ticket user is an explicit member of', async () => {
    const { access, visibility } = await harness({ value: { userId: 'alice' } })
    expect(visibility.canSee(SESSION)).toBe(false)
    await access.set(SESSION, [ALICE])
    expect(visibility.canSee(SESSION)).toBe(true)
  })

  it('re-reads the current principal on every call', async () => {
    const principal: PrincipalCell = { value: undefined }
    const { access, visibility } = await harness(principal)
    await access.set(SESSION, [ALICE])
    principal.value = { userId: 'bob' }
    expect(visibility.canSee(SESSION)).toBe(false)
    principal.value = { userId: 'alice' }
    expect(visibility.canSee(SESSION)).toBe(true)
  })
})
