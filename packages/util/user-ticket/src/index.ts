/**
 * Caller identity for Host Remote methods: the ambient request context of the
 * unary RPC being handled, and verification of the signed user ticket carried
 * in its Cookie header.
 * @module @deepseek-ai/dsh-user-ticket
 */

export { currentRpcRequest, runWithRpcRequest, type RpcRequestContext } from './rpc-request-context.ts'
export { currentTicketUserId, USER_TICKET_COOKIE, verifyUserTicket } from './user-ticket.ts'
