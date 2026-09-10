#!/usr/bin/env bash
# ============================================================================
# Cài đặt multi-agent setup cho DeepSeek Harness ($DSH_HOME, mặc định ~/.dsh).
#
# Cài đặt:
#   1. 5 preset agent  → $DSH_HOME/.agent-presets/
#        business-router (agent cha điều phối)
#        marketing, hr, accounting, reporting (agent phòng ban độc lập)
#   2. 4 skill phòng ban → $DSH_HOME/skills/   (CHỈ user root — mọi agent
#        nhìn thấy đủ 4 skill; persona từng agent quyết định dùng skill nào)
#   3. 5 workspace làm việc → ~/workspace/<preset name>/
#        mỗi agent một thư mục riêng (business-router, marketing, hr,
#        accounting, reporting)
#
# Cách dùng:  bash install.sh
# Bước kế:    node create-agents.mjs   (tạo 5 workspace + 5 session qua API)
#             hoặc tạo workspace/session thủ công trong GUI.
# Idempotent: chạy lại an toàn — không ghi đè preset/skill đã tồn tại.
# ============================================================================
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_DIR="$DSH_HOME/.agent-presets/business-router"
SKILLS_DIR="$DSH_HOME/skills"
# Mỗi agent làm việc trong workspace riêng: ~/workspace/<preset name>
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$HOME/workspace}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_PRESET="$SCRIPT_DIR/presets/business-router"
SRC_SKILLS="$SCRIPT_DIR/skills"

echo "→ DeepSeek Harness home: $DSH_HOME"

# 1) Preset business-router
if [ -d "$PRESET_DIR" ]; then
  echo "⚠ preset đã tồn tại tại $PRESET_DIR — giữ nguyên, không ghi đè."
  echo "  Muốn cập nhật: xóa thư mục đó rồi chạy lại script."
else
  mkdir -p "$PRESET_DIR"
  cp "$SRC_PRESET/preset.yml" "$SRC_PRESET/agent.cordis.yml" "$PRESET_DIR/"
  echo "✓ preset  → $PRESET_DIR"
fi

# 2) Các preset PHÒNG BAN ĐỘC LẬP (không cần router) — sinh bởi
#    build-standalone-presets.mjs; mỗi phòng ban = session riêng
for dept in marketing hr accounting reporting; do
  dest="$DSH_HOME/.agent-presets/$dept"
  if [ -d "$dest" ]; then
    echo "⚠ preset $dept đã tồn tại ($dest) — bỏ qua."
  else
    mkdir -p "$dest"
    cp "$SCRIPT_DIR/presets/$dept/preset.yml" "$SCRIPT_DIR/presets/$dept/agent.cordis.yml" "$dest/"
    echo "✓ preset  → $dest"
  fi
done

# 3) Skills phòng ban
for dept in marketing hr accounting reporting; do
  dest="$SKILLS_DIR/$dept"
  if [ -e "$dest/SKILL.md" ]; then
    echo "⚠ skill $dept đã tồn tại ($dest) — bỏ qua."
  else
    mkdir -p "$dest"
    cp "$SRC_SKILLS/$dept/SKILL.md" "$dest/"
    echo "✓ skill   → $dest"
  fi
done

# 4) Workspaces theo cấu trúc ~/workspace/<preset name>
#    Mỗi agent (preset) có thư mục làm việc riêng. Skill CHỈ đặt ở user root
#    (~/.dsh/skills — mục 3): mọi agent nhìn thấy đủ 4 skill, persona của
#    từng agent quyết định nó dùng skill nào (tách biệt bằng persona).
for preset_name in business-router marketing hr accounting reporting; do
  mkdir -p "$WORKSPACE_ROOT/$preset_name"
  echo "✓ workspace → $WORKSPACE_ROOT/$preset_name"
done

echo
echo "Hoàn tất cài đặt. Các bước tiếp theo:"
echo "  A) Tự động: node create-agents.mjs  → tạo 5 workspace + 5 session"
echo "     (mỗi session gắn đúng preset + workspace riêng)."
echo "  B) Thủ công trong GUI:"
echo "     1. Khởi động lại GUI (dsh web) để roster preset + skill mới được nạp."
echo "     2. Workspaces → tạo/open workspace: ~/workspace/business-router,"
echo "        ~/workspace/marketing, ~/workspace/hr, ~/workspace/accounting,"
echo "        ~/workspace/reporting."
echo "     3. Chế độ ROUTER: tạo session MỚI trong ~/workspace/business-router,"
echo "        chọn preset \"Business Router\"."
echo "     4. Chế độ ĐỘC LẬP: mỗi phòng ban 1 session trong workspace riêng,"
echo "        chọn preset \"Marketing Agent\" / \"HR Agent\" /"
echo "        \"Accounting Agent\" / \"Reporting Agent\"."
echo "  Thử (router): \"Lập kế hoạch chiến dịch cho sản phẩm mới\" hoặc"
echo "  \"Lập báo cáo doanh thu quý này và soạn JD tuyển marketing\"."
