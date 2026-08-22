/**
 * access domain zod schemas: the setAccess/getAccess request payloads and their
 * `{ userIds }` value shapes. `userIds` are plain strings on the wire.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload, ResponseValue } from './index.ts'

/** session.setAccess request payload. */
export const accessSetRequestSchema = z.object({
  sessionId: z.string(),
  userIds: z.array(z.string()),
}) as unknown as z.ZodType<Wire<RequestPayload<'session.setAccess'>>>

/** session.getAccess request payload. */
export const accessGetRequestSchema = z.object({
  sessionId: z.string(),
}) as unknown as z.ZodType<Wire<RequestPayload<'session.getAccess'>>>

/** Shared `{ userIds }` value of both access methods. */
const accessValueSchema = z.object({ userIds: z.array(z.string()) })

/** session.setAccess response value. */
export const accessSetValueSchema = accessValueSchema as unknown as z.ZodType<Wire<ResponseValue<'session.setAccess'>>>

/** session.getAccess response value. */
export const accessGetValueSchema = accessValueSchema as unknown as z.ZodType<Wire<ResponseValue<'session.getAccess'>>>
