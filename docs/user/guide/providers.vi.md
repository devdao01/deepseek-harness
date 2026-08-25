# Cấu hình model

[English](providers.md) | 中文

Hướng dẫn này giả định bạn đã khởi động Web UI theo [README gốc](../../../README.md#run). Thay đổi model có hiệu lực ngay ở lần yêu cầu tiếp theo, không cần khởi động lại máy chủ.

## Cấu hình DeepSeek

Mở **Settings → Models**. Thẻ DeepSeek cung cấp một trường API key; nhập key rồi lưu lại.

![Trang model: thẻ DeepSeek, cùng hai lối vào Add Provider và Add Custom Provider](providers-models-page.zh.png)

Key này chỉ được ghi, không thể đọc lại. Sau khi lưu, trang chỉ nhận được mô tả đã che khuất, không bao giờ nhận key ở dạng văn bản thuần. Key được lưu trong `$DSH_HOME/.credentials.yaml`, settings chỉ giữ lại tham chiếu credential của nó.

## Thêm nhà cung cấp trong danh mục

Chọn **Add Provider**, chọn một nhà cung cấp như Anthropic hoặc OpenAI, nhập API key rồi lưu lại. Danh mục đã cài đặt sẽ cung cấp endpoint, giao thức và danh sách model.

Các nhà cung cấp dùng xác thực gốc cần credential gốc riêng của mình. Bedrock, Vertex, Azure và Codex lần lượt dùng credential và region AWS, project ADC, `api-version` và OAuth; chỉ điền trường API key sẽ không cấu hình xong.

## Thêm nhà cung cấp tùy chỉnh

Với gateway nội bộ công ty, máy chủ tự host, hoặc nhà cung cấp không có trong danh mục đã cài đặt, chọn **Add Custom Provider**. Cung cấp Provider ID viết thường, base URL, giao thức API, credential và ít nhất một model.

![Form nhà cung cấp tùy chỉnh: Provider ID, Display Name, API Address, API Protocol, API Key](providers-custom-form.zh.png)

Provider ID là vĩnh viễn, vì yêu cầu, session đã lưu, giá trị model mặc định và tham chiếu credential đều dùng nó. Nếu cần đổi tên nhà cung cấp, hãy thêm nhà cung cấp mới rồi xóa nhà cung cấp cũ. Display name, base URL, giao thức, credential và model vẫn có thể chỉnh sửa.

Trong **Model Catalog**, chọn **Fetch Available Models** để truy vấn base URL và credential đang hiển thị trên form. Chọn ứng viên chỉ cập nhật bản nháp; nhà cung cấp chưa được lưu trữ trước khi bạn lưu lại. Nhà cung cấp trong danh mục dùng danh mục đã cài đặt, không gửi yêu cầu mạng.

### Đầu vào hình ảnh

Model được nhập thủ công luôn được coi là văn bản thuần cho tới khi tự khai báo khác đi, vì không có bước nào để hỏi endpoint chấp nhận modal nào. Đính kèm hình ảnh cho loại model này sẽ bị từ chối trước khi gửi, và model đó sẽ bị nêu tên.

Vì vậy, model có khả năng thị giác dưới nhà cung cấp tùy chỉnh cần thêm một dòng. Form không có trường tương ứng; hãy thêm `input` cho model đó trong `$DSH_HOME/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` chấp nhận `text` và `image`, và chỉ áp dụng cho model đó, nên một route có thể phục vụ cả hai loại model. Bỏ trường này — hoặc để danh sách rỗng, hai cách này đồng nghĩa — sẽ giữ nguyên modal mà danh mục đã cài đặt ghi cho model đó; model mà danh mục không mô tả sẽ dùng `defaultInput` của route đó làm phương án dự phòng.

Nếu tất cả model bạn nhập thủ công đều chấp nhận hình ảnh, bạn có thể đặt giá trị dự phòng một lần trên route, thay vì viết cho từng model:

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` là giá trị dự phòng, không phải giá trị ghi đè, mặc định là `[text]`: trên nhà cung cấp trong danh mục, nó chỉ trả lời cho model mà danh mục không mô tả, nên không bao giờ gỡ bỏ khả năng hình ảnh của model vốn đã có khả năng đó theo danh mục. Để thu hẹp khả năng của loại model này, hãy dùng `input` riêng của nó. Nhà cung cấp trong danh mục không có danh sách `models` để điền, nên viết dưới `modelOverrides`, dùng model id làm khóa:

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

Ngoài danh sách của chính model, mỗi danh sách phải viết ít nhất một modal; danh sách rỗng của chính model đồng nghĩa với việc bỏ nó. Modal không xác định viết ở bất kỳ đâu cũng sẽ bị từ chối.

Cả hai trường này đều là khẳng định về endpoint của bạn, không phải kiểm tra nó. Model khai báo khả năng hình ảnh mà endpoint không thực sự cung cấp sẽ không bị chặn ở đây, mà bị nhà cung cấp từ chối yêu cầu đó.

## Chọn model

Nhà cung cấp đã cấu hình sẽ xuất hiện trong bộ chọn model. Chọn model cũng sẽ đặt nó làm giá trị mặc định cho session mới. Session đã gửi yêu cầu sẽ giữ nguyên model được ghi trong log của chính nó.

Nếu giá trị mặc định đã lưu trỏ tới nhà cung cấp đã bị xóa, ô nhập sẽ hiển thị **Select a model**, và chặn việc nhập cho tới khi chọn model khác.

## Xử lý sự cố

- **`MISSING_CREDENTIAL`**: lưu key của nhà cung cấp qua trang model, hoặc cung cấp biến môi trường được tham chiếu.
- **`UNKNOWN_MODEL`**: chọn model đã cấu hình, hoặc thêm model còn thiếu vào nhà cung cấp tùy chỉnh.
- **Fetch Available Models trả về 401**: kiểm tra key. Việc khám phá model gọi endpoint `GET /models` tương thích OpenAI; với dịch vụ không cung cấp endpoint đó, hãy nhập model thủ công.
- **Hình ảnh bị từ chối trước khi gửi**: model đó chưa khai báo modal hình ảnh. Hãy thêm `input: [text, image]` cho model dưới nhà cung cấp tùy chỉnh; route chat-completions của chính DeepSeek là văn bản thuần, và không thể thay đổi qua cấu hình.
- **Nhà cung cấp từ chối yêu cầu kèm hình ảnh**: model đó khai báo khả năng hình ảnh mà endpoint của nó thực tế không cung cấp. Hãy gỡ `image` khỏi danh sách đã cấp khả năng đó cho nó — có thể là `input` của model, hoặc `defaultInput` của route — rồi mở session mới: hình ảnh đã đính kèm vẫn còn trong log session, nên cùng một yêu cầu sẽ lặp lại liên tục cho đến khi session không còn hình ảnh đó nữa.

## Cấu hình nâng cao

[Danh mục cấu hình plugin](../../config-catalog.md) được tự động sinh ra liệt kê mọi trường và giá trị mặc định được hỗ trợ. Tài liệu tham khảo [`dsh-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.md) và [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.md) sở hữu việc cấu hình `settings.yaml` trực tiếp, giải quyết danh mục, điều khiển reasoning, credential và lỗi adapter.
