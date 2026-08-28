/**
 * The ticket-backed request-principal resolver: mounted only with a secret, it
 * verifies the `dsh_ticket` cookie and resolves a valid ticket to its user
 * principal. A tampered, expired, or absent ticket resolves to no principal, and
 * a secretless deployment mounts no resolver at all.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { ConnectionTrustRequest, RequestPrincipalResolver } from '@deepseek-ai/dsh-client-connection'
import { UserId, signTicket } from '../src/index.ts'
import * as resolverPlugin from '../src/resolver.ts'

const SECRET = 'x'.repeat(40)
const nowSeconds = (): number => Math.floor(Date.now() / 1000)

async function mountResolver(config: Partial<resolverPlugin.Config>): Promise<RequestPrincipalResolver | undefined> {
  const ctx = new Context()
  const fiber = ctx.plugin(resolverPlugin, config)
  await fiber.await()
  return ctx.get('requestPrincipalResolver')
}

function requestWithCookie(cookie: string): ConnectionTrustRequest {
  return { headers: { cookie } } as unknown as ConnectionTrustRequest
}

describe('user-ticket request-principal resolver', () => {
  it('resolves a valid dsh_ticket cookie to its user principal', async () => {
    const resolver = await mountResolver({ secret: SECRET })
    const ticket = signTicket({ userId: UserId('alice'), exp: nowSeconds() + 300 }, SECRET)
    expect(resolver?.resolve(requestWithCookie(`other=1; dsh_ticket=${ticket}`))).toEqual({ userId: 'alice' })
  })

  it('mounts no resolver without a secret (single-tenant)', async () => {
    expect(await mountResolver({})).toBeUndefined()
  })

  it('resolves no principal for a ticket signed with a different secret', async () => {
    const resolver = await mountResolver({ secret: SECRET })
    const forged = signTicket({ userId: UserId('alice'), exp: nowSeconds() + 300 }, 'w'.repeat(40))
    expect(resolver?.resolve(requestWithCookie(`dsh_ticket=${forged}`))).toBeUndefined()
  })

  it('resolves no principal for an expired ticket', async () => {
    const resolver = await mountResolver({ secret: SECRET })
    const stale = signTicket({ userId: UserId('alice'), exp: nowSeconds() - 3600 }, SECRET)
    expect(resolver?.resolve(requestWithCookie(`dsh_ticket=${stale}`))).toBeUndefined()
  })

  it('resolves no principal when the ticket cookie is absent', async () => {
    const resolver = await mountResolver({ secret: SECRET })
    expect(resolver?.resolve(requestWithCookie('sessionid=abc'))).toBeUndefined()
  })
})
