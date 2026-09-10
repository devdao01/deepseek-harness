#!/usr/bin/env node
/**
 * Tạo 5 workspace + 5 session (router + 4 phòng ban) qua API local của
 * DeepSeek Harness GUI. Mỗi session gắn đúng preset + workspace riêng:
 *   ~/workspace/<preset name>
 *
 * Chạy: node create-agents.mjs
 * Biến môi trường: DSH_API_BASE (mặc định http://127.0.0.1:3080),
 *                  WORKSPACE_ROOT (mặc định $HOME/workspace)
 */

const BASE = process.env.DSH_API_BASE ?? 'http://127.0.0.1:3080'
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? `${process.env.HOME}/workspace`

const AGENTS = [
  { id: 'business-router', preset: 'business-router' },
  { id: 'marketing', preset: 'marketing' },
  { id: 'hr', preset: 'hr' },
  { id: 'accounting', preset: 'accounting' },
  { id: 'reporting', preset: 'reporting' },
]

async function rpc(method, payload) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method,
      payload,
    }),
  })
  const body = await res.json()
  if (!body.result?.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(body.result?.error ?? body)}`)
  }
  return body.result.value
}

for (const agent of AGENTS) {
  const path = `${WORKSPACE_ROOT}/${agent.id}`
  const { workspace, created } = await rpc('workspace.create', { path })
  const { sessionId } = await rpc('session.create', {
    workspaceId: workspace.workspaceId,
    agentPreset: agent.preset,
  })
  console.log(
    `✓ ${agent.id.padEnd(14)} ws=${workspace.workspaceId}  session=${sessionId}  (workspace ${created ? 'mới' : 'đã có'})`,
  )
}
console.log('\nXong. Mở GUI → mỗi session tương ứng với một agent (preset + workspace riêng).')
