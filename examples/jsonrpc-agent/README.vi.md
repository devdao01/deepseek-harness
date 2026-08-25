# jsonrpc-agent

[English](README.md) | 中文

Tổ hợp agent (tác tử) lập trình không người trực, hướng tới runtime JSON-RPC tích hợp sẵn trong Python SDK. Nó cố ý không nạp UI terminal, logger console, giao diện phê duyệt hay công cụ tương tác người dùng, vì stdout thuộc về giao thức SDK và các lượt được SDK điều khiển.

Các công cụ hướng tới model gồm:

- `bash`, chỉ chạy foreground
- `read`, `write` và `edit`
- `subagent`, dùng một nhà cung cấp spawn chạy foreground trong cùng tiến trình
- `todo_write`

Runtime xung quanh còn nạp lưu bền vững session JSONL và nén ngữ cảnh (context compaction) tự động. `maxTokensAsSuccess` giữ lại các lượt model bị giới hạn bởi mức trần token như kết quả đánh giá đã được chấp nhận, đồng thời vẫn giữ lý do `max-tokens` của nó.

## Môi trường runtime

| Biến | Công dụng |
|---|---|
| `DEEPSEEK_API_KEY` | Thông tin xác thực gửi tới endpoint máy chủ tương thích OpenAI |
| `DEEPSEEK_BASE_URL` | Endpoint máy chủ mà `dsh-llm-deepseek` sử dụng |
| `DSH_CWD` | Workspace agent mà công cụ bash và filesystem sử dụng |
| `DSH_CONTEXT_WINDOW` | Dung lượng ngữ cảnh được ghi cho mục `DSH_MODEL` trong biến thể tối giản |
| `DSH_MAX_TOKENS_AS_SUCCESS` | `true` (mặc định) chấp nhận kết quả bị giới hạn bởi mức trần token; `false` báo cáo đó là lỗi |
| `DSH_MODEL` | Model mặc định mà `minimal.py` dùng; `--model` được ưu tiên hơn |
| `DSH_SESSION_ROOT` | Thư mục session JSONL |
| `DSH_SYSTEM_PROMPT` | Persona lập trình do triển khai cung cấp |

Truyền đường dẫn cấu hình qua tùy chọn `cordis` của Python SDK hoặc `DSH_CORDIS_CONFIG`. File thực thi tích hợp sẵn đã mang theo mọi plugin được chỉ định trong file này; máy đích không cần Node.js.

## Biến thể tối giản

[`minimal.cordis.yml`](minimal.cordis.yml) là phiên bản độc lập đầy đủ của Web `minimal` preset. `DSH_SYSTEM_PROMPT` chọn prompt hệ thống của nó, nếu chưa đặt sẽ dùng `You are a helpful software engineer assistant.`. Nó ngăn mỗi đóng góp runtime-context của system-prompt cho session mới, và không gắn plugin nén ngữ cảnh. Các công cụ hướng tới model nghiêm ngặt chỉ có:

- `bash` được lưu bền vững trong phạm vi chủ sở hữu
- `str_replace_editor` cung cấp `view`, `create`, `str_replace` và `insert`

Nó tổ hợp PTY cục bộ, backend `fs-local` trần, cần thiết cho runtime tích hợp sẵn, chính sách danger-full-access cho Bash bền vững, và lưu bền vững JSONL không nén. Đường dẫn tuyệt đối của Bash và editor có thể sửa đổi bất kỳ đường dẫn nào mà tiến trình runtime có quyền truy cập, nên biến thể này chỉ nên chạy trên checkout hoặc container có thể bỏ đi.  PTY bền vững cần môi trường terminal POSIX, nên không phù hợp với giao diện agent trên Windows.

[`minimal.py`](minimal.py) chạy tổ hợp này qua Python SDK, và dùng `DSH_MODEL` làm model mặc định. [Hướng dẫn Python SDK](../../docs/user/guide/python-sdk.md) giới thiệu cài đặt, chạy, chọn workspace và định danh session; [tài liệu tham khảo SDK](../../python/sdk/README.md) sở hữu vòng đời runtime và ngữ nghĩa kết quả.
