/**
 * skills domain zod schemas (names derived from map keys: skillListRequestSchema /
 * skillListValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema, workspaceIdSchema } from './sessions.schema.ts'
import type { SkillContent, SkillEntry } from './skills.ts'

/** SkillEntry row of skill.list. */
export const skillEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  modelInvocable: z.boolean(),
}) satisfies z.ZodType<Wire<SkillEntry>>

/** skill.list request payload. */
export const skillListRequestSchema = z.object({
  sessionId: sessionIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'skill.list'>>>

/** skill.list response value. */
export const skillListValueSchema = z.object({
  skills: z.array(skillEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'skill.list'>>>

/** SkillContent value of skill.read. */
export const skillContentSchema = z.object({
  description: z.string(),
  whenToUse: z.string().optional(),
  content: z.string(),
}) satisfies z.ZodType<Wire<SkillContent>>

/** skill.read request payload. */
export const skillReadRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'skill.read'>>>

/** skill.read response value. */
export const skillReadValueSchema = skillContentSchema satisfies z.ZodType<Wire<ResponseValue<'skill.read'>>>

/** skill.write request payload. */
export const skillWriteRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  content: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'skill.write'>>>

/** skill.write response value. */
export const skillWriteValueSchema = z.object({
  name: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'skill.write'>>>

/** skill.remove request payload. */
export const skillRemoveRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'skill.remove'>>>

/** skill.remove response value. */
export const skillRemoveValueSchema = z.object({
  removed: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'skill.remove'>>>
