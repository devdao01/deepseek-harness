# Bắt đầu nhanh với Python SDK

[English](python-sdk.md) | 中文

Hướng dẫn này giới thiệu cách sử dụng theo hướng lập trình bên ngoài Web UI: cài đặt Python SDK đã phát hành, chạy tổ hợp agent (tác tử) đi kèm trong repo, và gọi cùng bộ API đó trong chương trình của riêng bạn.

## Điều kiện tiên quyết

- Python 3.10 trở lên
- Git
- Linux x64, Linux arm64, hoặc macOS 14 trở lên trên arm64
- Endpoint API và credential tương thích DeepSeek
- Workspace cách ly mà agent có thể sửa đổi

## Cài đặt SDK

Clone repo để dùng các ví dụ có thể chạy trong đó, tạo virtual environment, và cài đặt SDK cùng runtime tích hợp sẵn cùng phiên bản:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

Runtime sau khi cài đặt không yêu cầu hệ thống có sẵn Node.js. Người đóng góp trong repo cần build runtime hoặc gói wheel từ mã nguồn nên dùng [quy trình làm việc cho người đóng góp Python](../../../python/development.md).

## Chạy ví dụ đi kèm trong repo

Hãy đặt credential trong môi trường. Nếu model không được cung cấp bởi endpoint DeepSeek mặc định mà qua proxy tương thích OpenAI, còn cần đặt `DEEPSEEK_BASE_URL`.

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
# export DSH_MODEL=deepseek-v4-flash
# export DSH_SYSTEM_PROMPT='You are a helpful software engineer assistant.'
```

Chạy một tác vụ nhắm vào workspace và thư mục session đã cách ly:

```sh
python examples/jsonrpc-agent/minimal.py \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/path/to/sessions \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

Script sẽ in phản hồi cuối cùng của assistant. Thư mục session sẽ nhận được log JSONL, chứa yêu cầu model đã được lắp ráp và các lệnh gọi công cụ.

## Dùng SDK trong chương trình của riêng bạn

Ví dụ đi kèm trong repo là một lớp bọc nhẹ quanh các lệnh gọi SDK sau:

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

config = Path("examples/jsonrpc-agent/minimal.cordis.yml").resolve()
workspace = Path("/absolute/path/to/workspace").resolve()
sessions = Path("/absolute/path/to/sessions").resolve()

with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    session_root=str(sessions),
    cordis=str(config),
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

`DeepSeekHarness` khởi động runtime tích hợp sẵn theo kiểu lazy, và tiếp tục tái sử dụng cho tới khi thoát khỏi context manager. Tái sử dụng cùng một harness với cùng session id sẽ giữ lại tiến trình Bash thuộc về session đó, gồm cả thư mục làm việc, các biến đã export và hàm shell. Tác vụ độc lập nên dùng session id mới; chỉ tái sử dụng id cũ khi lệnh gọi tiếp theo cần tiếp nối cùng một cuộc hội thoại bền vững.

## Tìm hiểu tổ hợp ví dụ

| Thuộc tính | Giá trị |
|---|---|
| Prompt hệ thống | `DSH_SYSTEM_PROMPT`; nếu chưa đặt dùng `You are a helpful software engineer assistant.` |
| Model mà `minimal.py` dùng | `--model`, sau đó `DSH_MODEL`, cuối cùng `deepseek-v4-flash` |
| Công cụ hướng tới model | Chỉ có `bash` bền vững và `str_replace_editor` |
| Timeout Bash | 300 giây |
| Giới hạn output editor | 16.000 ký tự |
| Nén ngữ cảnh | Đã tắt |
| Hệ thống tệp | Backend cục bộ trần; editor dùng đường dẫn tuyệt đối, có thể truy cập bất kỳ đường dẫn nào tiến trình runtime nhìn thấy |
| Lưu bền vững session | JSONL không nén dưới `DSH_SESSION_ROOT` |

Tổ hợp này bỏ qua danh tính harness, văn bản chỉ dẫn workspace, skill (kỹ năng), Bash một lần, công cụ tác vụ, nén ngữ cảnh và mọi plugin hướng tới model khác. Sự thật về chính sách sandbox được ghi lại như ngữ cảnh người dùng runtime, chứ không được thêm vào prompt hệ thống.

## Chọn workspace và session id

`cwd` dùng để chọn workspace mà agent có thể truy cập, `session_root` dùng để lưu log và trạng thái session. Tác vụ độc lập nên dùng session id mới; chỉ tái sử dụng id cũ khi lệnh gọi tiếp theo cần tiếp nối cùng một cuộc hội thoại và trạng thái shell bền vững.

Tổ hợp này dùng `danger-full-access`. Chỉ nên chạy trong checkout hoặc container có thể bỏ đi: Bash và editor có thể sửa đổi bất kỳ đường dẫn nào mà tiến trình runtime có quyền truy cập. Backend PTY bền vững cần môi trường terminal POSIX, nên tổ hợp này không hỗ trợ agent trên Windows.

Nội dung tổ hợp chính xác thuộc sở hữu của [tài liệu tham khảo ví dụ `jsonrpc-agent`](../../../examples/jsonrpc-agent/README.md). [Tài liệu tham khảo Python SDK](../../../python/sdk/README.md) giới thiệu vòng đời, kết quả, thông báo, lựa chọn runtime và cấu hình; [Cordis primer](../../cordis-primer.md) giới thiệu cú pháp tổ hợp.
