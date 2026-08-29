/**
 * The secret-backed operator verifier: mounted only with a secret, it admits a
 * request whose configured header matches the secret (constant-time compare over
 * equal-length buffers) and refuses every other request. A secretless deployment
 * mounts no verifier at all.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { ConnectionTrustRequest, OperatorAuth } from '@deepseek-ai/dsh-client-connection'
import * as operatorPlugin from '../src/operator.ts'
import { DEFAULT_OPERATOR_HEADER } from '../src/operator.ts'

const SECRET = 's'.repeat(40)

async function mountOperator(config: Partial<operatorPlugin.Config>): Promise<OperatorAuth | undefined> {
  const ctx = new Context()
  const fiber = ctx.plugin(operatorPlugin, config)
  await fiber.await()
  return ctx.get('operatorAuth')
}

function requestWithHeaders(headers: Record<string, string>): ConnectionTrustRequest {
  return { headers } as unknown as ConnectionTrustRequest
}

describe('user-ticket operator verifier', () => {
  it('mounts no verifier without a secret (single-tenant)', async () => {
    expect(await mountOperator({})).toBeUndefined()
    expect(await mountOperator({ secret: '' })).toBeUndefined()
  })

  it('admits a request whose default header carries the secret', async () => {
    const operator = await mountOperator({ secret: SECRET })
    expect(operator?.verify(requestWithHeaders({ [DEFAULT_OPERATOR_HEADER]: SECRET }))).toBe(true)
  })

  it('refuses a request whose header value does not match the secret', async () => {
    const operator = await mountOperator({ secret: SECRET })
    expect(operator?.verify(requestWithHeaders({ [DEFAULT_OPERATOR_HEADER]: 'w'.repeat(40) }))).toBe(false)
  })

  it('refuses a header value of a different length than the secret', async () => {
    const operator = await mountOperator({ secret: SECRET })
    expect(operator?.verify(requestWithHeaders({ [DEFAULT_OPERATOR_HEADER]: 'short' }))).toBe(false)
  })

  it('refuses a request with no operator header', async () => {
    const operator = await mountOperator({ secret: SECRET })
    expect(operator?.verify(requestWithHeaders({ 'x-other': SECRET }))).toBe(false)
  })

  it('reads the configured custom header instead of the default', async () => {
    const operator = await mountOperator({ secret: SECRET, header: 'x-mtil-operator' })
    expect(operator?.verify(requestWithHeaders({ 'x-mtil-operator': SECRET }))).toBe(true)
    expect(operator?.verify(requestWithHeaders({ [DEFAULT_OPERATOR_HEADER]: SECRET }))).toBe(false)
  })
})
