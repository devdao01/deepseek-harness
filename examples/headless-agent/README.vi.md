# headless-agent

[English](README.md) | 中文

Thư mục này chịu trách nhiệm lắp ráp cho việc replay và kiểm thử model thật của headless coding agent (tác tử): DeepSeek V4 + công cụ bash và filesystem cục bộ + ủy quyền subagent + workflow và Ralph agent hoàn toàn mới lặp lại + `todo_write` + lưu bền vững JSONL. Thư mục này gắn rõ ràng agent spine dùng chung, một root agent, chính sách lưu bền vững và checkpoint; đây không phải là lối vào sản phẩm thứ hai.

## Chạy

```sh
# repo root .env (gitignored) or exported env:
#   DEEPSEEK_API_KEY=sk-…
#   DEEPSEEK_BASE_URL=https://…   # optional; defaults to the public API
pnpm dsh --profile headless "fix the failing test in this workspace"
```

Lệnh sản phẩm là [`dsh --profile headless`](../../apps/cli/README.md): nó nhận một tác vụ không rỗng, tạo và lưu bền vững session mới, in văn bản assistant cuối cùng, rồi thoát.

Bộ snapshot chạy cấu hình của thư mục này qua [`tests/fixtures/headless-driver.ts`](tests/fixtures/headless-driver.ts). Tiến trình chưa được export và chỉ dùng cho kiểm thử này phát ra các sự kiện session chuẩn dưới dạng JSONL trước khi ghi lại kết quả. Luồng sự kiện này thuộc về hạ tầng kiểm thử, không phải định dạng đầu ra CLI (giao diện dòng lệnh) được hỗ trợ chính thức. Sub-session chỉ hiển thị ra bên ngoài qua các sự kiện công cụ và kết quả của session cha.

## Overlay E2B POC

[`e2b.cordis.yml`](e2b.cordis.yml) thay thế nhà cung cấp filesystem và subprocess cục bộ bằng một sandbox E2B dùng chung, trong khi vẫn giữ `dsh-bash-local` và cùng bộ công cụ hướng tới model. Hãy đặt `E2B_API_KEY` cùng với `DEEPSEEK_API_KEY` trong `.env` ở thư mục gốc repo (đã bị git bỏ qua), sau đó chạy bài test tổ hợp thực tế bị chặn bởi credential; nó điều khiển FS, Bash, PTY và LSP trong cùng một sandbox, và chứng minh sandbox cuối cùng sẽ bị xóa:

```sh
pnpm exec vitest run --config vitest.e2e.config.ts packages/e2b/e2b/tests/composition.e2e.ts
```

Overlay này sẽ tạo cùng một cwd tuyệt đối trong sandbox, nhưng không upload hay mount workspace của máy chủ. Thay đổi về file và Bash chỉ tồn tại trong E2B; Cordis, lời gọi model, trạng thái agent/session, log session, skill (kỹ năng) và bộ đệm SDK vẫn ở trên máy chủ. Tổ hợp này sẽ hủy sandbox của nó khi hết thời gian hoặc khi giải phóng tài nguyên. Đây là POC tổ hợp nhà cung cấp, không phải một cuộc di trú harness đầy đủ hay tính năng đồng bộ workspace.

## Cấu hình nâng cao

[`advanced.cordis.yml`](advanced.cordis.yml) thêm Code Mode và công cụ Cordis vào tổ hợp kiểm thử.
