/**
 * Browser-safe UUID minting for client-side wire correlation. The canonical
 * implementation lives in `@deepseek-ai/dsh-llm` (INLINE_SAFE shared vocabulary
 * that already mints browser-side ids); this re-export keeps the
 * `@deepseek-ai/dsh-host-apiproxy/client` surface — `mintRpcId` and the client
 * layers that import from it — pointed at one implementation without a
 * duplicate. `crypto.randomUUID` is secure-context-only in browsers and must
 * not be used here (see the secure-context-origin Agent Note).
 * @module
 */

export { randomUuid } from '@deepseek-ai/dsh-llm/random-uuid'
