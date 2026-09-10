#!/usr/bin/env node
/**
 * Sinh 4 preset độc lập (marketing, hr, accounting, reporting) từ preset
 * business-router (bản thân nó là standard + router). Mỗi preset độc lập:
 *   - persona riêng (vai trò + skill được phép)
 *   - không có delegation group (không spawn subagent)
 *   - bộ tools riêng: marketing/hr không có bash; accounting không có web
 *
 * Chạy: node build-standalone-presets.mjs   (từ thư mục multi-agent-setup)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = join(HERE, 'presets/business-router/agent.cordis.yml')
const OUT = join(HERE, 'presets')

// ---------- department table ----------
const DEPARTMENTS = [
  {
    id: 'marketing',
    name: 'Marketing Agent',
    order: 20,
    dropRows: ['delegation', 'tool-bash'], // không chạy lệnh
    dropWeb: false,
    persona: `Bạn là AGENT MARKETING độc lập. Người dùng nhắn trực tiếp cho bạn để nhờ xử lý công việc marketing: lập kế hoạch chiến dịch, viết nội dung quảng cáo/bài đăng, nghiên cứu thị trường, phân tích đối thủ. Skill bạn sở hữu: marketing — hãy đọc và tuân theo quy trình trong đó. KHÔNG dùng skill của phòng ban khác (hr, accounting, reporting). Bạn KHÔNG có bash (không chạy lệnh) — chỉ dùng web, file và skill. Trả lời trực tiếp người dùng, rõ ràng, có cấu trúc.`,
  },
  {
    id: 'hr',
    name: 'HR Agent',
    order: 21,
    dropRows: ['delegation', 'tool-bash'], // không chạy lệnh
    dropWeb: false,
    persona: `Bạn là AGENT NHÂN SỰ (HR) độc lập. Người dùng nhắn trực tiếp cho bạn để nhờ xử lý công việc nhân sự: soạn mô tả công việc (JD), quy trình tuyển dụng, đánh giá nhân viên, chính sách phúc lợi. Skill bạn sở hữu: hr — hãy đọc và tuân theo quy trình trong đó. KHÔNG dùng skill của phòng ban khác. Bạn KHÔNG có bash — chỉ dùng web, file và skill. Thông tin nhân sự là nhạy cảm: không phát tán nội dung ngoài phạm vi nhiệm vụ.`,
  },
  {
    id: 'accounting',
    name: 'Accounting Agent',
    order: 22,
    dropRows: ['delegation'], // giữ bash để tính toán
    dropWeb: true,            // kế toán không cần web
    persona: `Bạn là AGENT KẾ TOÁN độc lập. Người dùng nhắn trực tiếp cho bạn để nhờ tính toán chi phí/doanh thu/lợi nhuận, lập dự toán, đối chiếu số liệu. Skill bạn sở hữu: accounting — hãy đọc và tuân theo quy trình trong đó. Bạn CÓ bash để tính toán/xử lý số liệu chính xác. KHÔNG dùng skill của phòng ban khác. Trình bày kết quả dạng bảng rõ ràng kèm giả định. KHÔNG đưa kết luận mang tính pháp lý/thuế khi không được yêu cầu.`,
  },
  {
    id: 'reporting',
    name: 'Reporting Agent',
    order: 23,
    dropRows: ['delegation'], // giữ bash + web để thu thập/xử lý dữ liệu
    dropWeb: false,
    persona: `Bạn là AGENT BÁO CÁO độc lập. Người dùng nhắn trực tiếp cho bạn để nhờ tổng hợp số liệu từ nhiều nguồn, lập báo cáo định kỳ, phân tích xu hướng, trực quan hóa. Skill bạn sở hữu: reporting — hãy đọc và tuân theo quy trình trong đó. Bạn CÓ bash và web để thu thập/xử lý dữ liệu. KHÔNG dùng skill của phòng ban khác. Xuất báo cáo có cấu trúc (bảng, tóm tắt, khuyến nghị), nêu rõ nguồn dữ liệu.`,
  },
]

// ---------- line-based row cutter (top-level rows start at column 0 with "- id:") ----------
function splitRows(text) {
  const lines = text.split('\n')
  const blocks = [] // {start, end, id}
  let current = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- id: (\S+)/)
    if (m && lines[i].startsWith('- id:')) {
      if (current) current.end = i
      current = { start: i, end: i + 1, id: m[1] }
      blocks.push(current)
    } else if (current) {
      current.end = i + 1
    }
  }
  return { lines, blocks }
}

function buildPreset(dept) {
  const text = readFileSync(BASE, 'utf8')
  const { lines, blocks } = splitRows(text)

  const personaBlock = blocks.find(b => b.id === 'persona')
  if (!personaBlock) throw new Error('không tìm thấy row persona trong base')

  const drop = new Set(dept.dropRows)
  if (dept.dropWeb) drop.add('tool-web')

  const out = []
  for (let i = 0; i < lines.length; i++) {
    const inPersona = i >= personaBlock.start && i < personaBlock.end
    if (inPersona) {
      if (i === personaBlock.start) {
        out.push(
          '- id: persona',
          "  name: '@deepseek-ai/dsh-persona'",
          '  config:',
          '    text: >-',
          ...dept.persona.split('\n').map(l => '      ' + l),
          '',
        )
      }
      continue
    }
    const block = blocks.find(b => i >= b.start && i < b.end)
    if (block && drop.has(block.id)) {
      i = block.end - 1 // bỏ cả block
      continue
    }
    out.push(lines[i])
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

// ---------- write outputs ----------
for (const dept of DEPARTMENTS) {
  const dir = join(OUT, dept.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.cordis.yml'), buildPreset(dept))
  writeFileSync(join(dir, 'preset.yml'),
    `name: ${dept.name}\ndescription: >-\n  Agent ${dept.id} độc lập — người dùng nhắn trực tiếp, không cần agent cha.\norder: ${dept.order}\n`)
  console.log(`✓ presets/${dept.id}/`)
}
console.log('done')
