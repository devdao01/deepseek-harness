# Multi-Agent thực tế: Router đa phòng ban (marketing / hr / accounting / reporting)

Kiến trúc ví dụ: **một agent cha (router)** nhận yêu cầu từ người dùng, route cho
**các agent con chuyên môn** (mỗi phòng ban một agent với persona + bộ tools +
skill riêng), thu kết quả và báo lại người dùng.

```text
Người dùng
   │  "Lập kế hoạch chiến dịch & soạn JD tuyển marketing"
   ▼
┌───────────────────────────┐
│  PARENT (router)          │  preset: business-router (session chính)
│  persona: điều phối viên  │
│  tools: marketing, hr,    │
│         accounting,       │
│         reporting         │
└───┬──────┬──────┬──────┬──┘
    ▼      ▼      ▼      ▼
 marketing  hr  accounting  reporting     ← mỗi cái = 1 tool-subagent instance
 (persona  (persona  (persona    (persona     spawn provider, toolFilter riêng,
  + skill)  + skill)  + skill)    + skill)     chạy session con riêng
```

## Nguyên lý (dùng đúng cơ chế của harness)

- **Agent con không phải "tạo trước"** — chúng được *cấu hình trước* dưới dạng
  các instance `tool-subagent` (mỗi instance = 1 tool model thấy được, ví dụ
  `marketing`). Khi router gọi tool, harness `spawn` một child agent mới với
  persona + bộ tools đã khai báo, chạy trong session riêng.
- **Phân biệt agent** = `persona` (vai trò/nhiệm vụ) + `toolFilter.allow`
  (chỉ cấp tools phù hợp — ví dụ marketing không có `bash`, accounting thì có)
  + skill riêng.
- **Skills** nằm ở user root `~/.dsh/skills/<tên>/SKILL.md` — mọi agent thấy
  cùng catalog, nên persona mỗi agent *tuyên bố quyền sở hữu* skill của phòng
  mình và cấm dùng skill phòng khác (ràng buộc mềm, theo thiết kế của harness).
- **Thu kết quả**: `backgroundMode: one-shot` → mặc định foreground: router gọi
  tool, chờ kết quả cuối của child rồi tổng hợp báo người dùng. (Muốn chạy nền:
  truyền `run_in_background: true` → nhận job id → thu bằng `job_output`; hoặc
  đổi `backgroundMode: continuable` để nhận childId + settlement notice.)

## Cài đặt

```bash
cd multi-agent-setup
bash install.sh
```

Script copy:
- `presets/business-router/` → `~/.dsh/.agent-presets/business-router/`
- `skills/{marketing,hr,accounting,reporting}/` → `~/.dsh/skills/`

Rồi **khởi động lại GUI** và **tạo session mới**, chọn preset **"Business Router"**
(preset chỉ chọn được trên session trống — sau khi có turn thì bị `agent-preset-locked`;
session cũ của bạn giữ preset `standard`).

## Chế độ 2 — phòng ban HOẠT ĐỘNG ĐỘC LẬP (không cần agent cha)

Agent con trong chế độ router **không độc lập** (chúng là tool spawn theo yêu cầu;
kể cả `continuable` cũng cần cha **live** để follow-up — *"No host-user
continuation"* trong README của `dsh-subagent`). Muốn mỗi phòng ban là một agent
**đứng riêng**, nhắn trực tiếp được bất cứ lúc nào → dùng **preset riêng + session
riêng** cho từng phòng ban.

Bộ `presets/{marketing,hr,accounting,reporting}/` đã được sinh sẵn bởi
`build-standalone-presets.mjs`:

| Preset | Persona | Bash | Web | Skill |
|---|---|---|---|---|
| `marketing` (Marketing Agent) | làm chiến dịch, viết nội dung | ❌ | ✅ | `marketing` |
| `hr` (HR Agent) | JD, tuyển dụng, phúc lợi | ❌ | ✅ | `hr` |
| `accounting` (Accounting Agent) | tính toán, dự toán, đối chiếu | ✅ | ❌ | `accounting` |
| `reporting` (Reporting Agent) | tổng hợp, báo cáo, phân tích | ✅ | ✅ | `reporting` |

Mỗi preset = cấu trúc `standard` gọn lại: **không có** delegation group (agent
này không spawn subagent), không `tool-goal`? (vẫn giữ), giữ plan/compaction/jobs/
skills. Khác biệt chính giữa các phòng ban là **bộ tools** (bash/web) + **persona**.

**Cách dùng:** tạo 1 session cho mỗi phòng ban (chọn preset tương ứng), rồi nhắn
trực tiếp:

```text
Session "Marketing":  "Soạn 3 bài đăng Facebook cho chiến dịch Tết"
Session "Kế toán":    "Tính chi phí vận hành Q3 từ data.csv, so sánh với Q2"
Session "Báo cáo":    "Lập báo cáo tổng hợp doanh thu tuần này"
```

Mỗi session giữ lịch sử riêng, agent nhớ ngữ cảnh phòng ban của nó.

> Lưu ý: agent cha (router) **không giao việc được** cho các session độc lập này
> (không có cơ chế cross-session messaging) — 2 chế độ là 2 cách dùng khác nhau.
> Chọn 1 trong 2: **một cửa qua router** (mọi thứ qua 1 session) hoặc **nhiều
> session độc lập** (nhắn từng phòng ban). Có thể dùng cả hai cùng lúc.

## Workspace: mỗi preset một thư mục riêng — `~/workspace/<preset name>`

Mỗi agent làm việc trong workspace riêng của nó. `install.sh` tạo sẵn:

```text
~/workspace/
├── business-router/   ← session của agent cha (router)
├── marketing/         ← session Marketing Agent (+ .dsh/skills/marketing)
├── hr/                ← session HR Agent (+ .dsh/skills/hr)
├── accounting/        ← session Accounting Agent (+ .dsh/skills/accounting)
└── reporting/         ← session Reporting Agent (+ .dsh/skills/reporting)
```

**Cách tạo session đúng workspace:**
- GUI: tạo/open workspace chỉ tới `~/workspace/<tên>` (mục Workspaces), rồi tạo
  session **mới trong workspace đó** với preset tương ứng.
- API: `workspace.create({ path: "~/workspace/marketing" })` →
  `session.create({ workspaceId, agentPreset: "marketing" })`
  (chỉ 1 trong `workspaceId`/`cwd`; preset chỉ chọn được trên session trống).

**Skill CHỈ ở user root:** tất cả skill đặt tại `~/.dsh/skills/<tên>/SKILL.md` —
mọi agent (cả độc lập lẫn router children) nhìn thấy đủ 4 skill; persona của
từng agent quyết định nó dùng skill nào (tách biệt bằng persona, không tách
biệt vật lý). Không đặt skill trong workspace — tránh trùng lặp và lệch bản.

**Lưu ý chế độ router:** agent con `spawn` thừa hưởng **cwd của session cha** —
nên trong chế độ router, các agent con làm việc trong
`~/workspace/business-router`, không phải workspace phòng ban. Nếu muốn child
xử lý file phòng ban: hướng dẫn child thao tác trên path `~/workspace/<tên>/...`
(hoặc dùng chế độ độc lập — mỗi phòng ban một session riêng trong workspace
riêng).

## Cấu trúc file

```
multi-agent-setup/
├── install.sh                  # cài router preset + 4 preset độc lập + skills
├── build-standalone-presets.mjs  # sinh 4 preset độc lập từ preset business-router
├── README.md
├── presets/
│   ├── business-router/        # chế độ 1: agent cha điều phối
│   │   ├── preset.yml
│   │   └── agent.cordis.yml    # persona router + 4 tool-instance phòng ban
│   ├── marketing/              # chế độ 2: độc lập (không bash)
│   ├── hr/                     # chế độ 2: độc lập (không bash)
│   ├── accounting/             # chế độ 2: độc lập (bash, không web)
│   └── reporting/              # chế độ 2: độc lập (bash + web)
└── skills/
    ├── marketing/SKILL.md
    ├── hr/SKILL.md
    ├── accounting/SKILL.md
    └── reporting/SKILL.md

# install.sh còn tạo (runtime):
#   ~/workspace/<preset name>/...                     — 5 thư mục workspace
#   (skill KHÔNG đặt trong workspace — chỉ ở ~/.dsh/skills)
```

## Cách dùng (ví dụ prompt)

| Người dùng nói | Router làm |
|---|---|
| "Lập kế hoạch chiến dịch Tết cho sản phẩm X" | gọi `marketing` |
| "Soạn JD tuyển 2 kế toán và chính sách phúc lợi" | gọi `hr` |
| "Tính chi phí vận hành quý này từ file data.csv" | gọi `accounting` |
| "Báo cáo doanh thu tổng hợp các phòng ban" | gọi `reporting` |
| "Kế hoạch marketing + dự toán chi phí" | gọi **song song** `marketing` + `accounting` trong 1 lượt |

## Tùy biến

- **Thêm phòng ban**: copy 1 block `tool-subagent-<tên>` trong
  `agent.cordis.yml`, đổi `toolName` + `persona` + `toolFilter`; thêm skill
  tương ứng.
- **Đổi model cho agent con**: thêm `agentOptions: { provider, model, maxTokens }`
  vào instance (in-process provider coi đó là override).
- **Cho phép agent con dùng thêm tool**: thêm tên tool (theo
  `docs/tool-catalog.md`: `bash`, `web_search`, `read`, `write`, `edit`,
  `glob`, `grep`, `skill`, `todo_write`, `job_*`, ...) vào `toolFilter.allow`.
- **Chạy nền / tiếp tục**: đổi `backgroundMode` thành `continuable` → router
  nhận childId, gửi thêm việc bằng `send_message`, nhận notice khi child xong.
- **Bật provider ngoài process** (Codex/Claude Code): cài package provider +
  bỏ `disabled: true` trên row `tool-subagent-codex` / `tool-subagent-claude-code`
  (xem README của `dsh-subagent-codex`).

## Lưu ý / giới hạn

- Agent con **không có sẵn** (không phải hộp thư cố định) — chúng được tạo khi
  router gọi tool; session con lưu trong `subagent.list`/`subagent.history`.
- `toolFilter` giới hạn *tầng tool toàn cục*, không giới hạn từng skill — phân
  quyền skill dựa vào persona (theo thiết kế của harness).
- Agent con thừa hưởng quyền sandbox của cha nhưng **approval bị khóa
  `never`** (child không hỏi xác nhận; việc ngoài scope phải báo giới hạn).
- Preset được nạp khi khởi động — thay đổi `agent.cordis.yml` cần restart GUI.
