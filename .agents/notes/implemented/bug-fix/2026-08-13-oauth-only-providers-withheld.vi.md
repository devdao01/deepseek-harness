# Agent Note: Danh mục nhà cung cấp có thể cấu hình không còn cung cấp các nhà cung cấp chỉ xác thực bằng OAuth

Status: implemented

[English](2026-08-13-oauth-only-providers-withheld.md) | Tiếng Việt

## Vấn đề

Trang cấu hình model cung cấp `openai-codex` như một tuyến pi-ai bình thường, kèm đúng dòng placeholder dùng chung cho mọi nhà cung cấp pi-ai: nhập API key, hoặc để trống để dùng xác thực từ môi trường. Cấu hình theo cách đó rồi gửi tin nhắn, lượt đó sẽ thất bại với `Provider is not configured: openai-codex`, và bị adapter xếp vào `PI_AI_ERROR` mặc định.

Kiểu cấu hình mà dòng placeholder đó mời gọi không thể nào hoạt động trên tuyến này. `resolveProviderAuth` của pi-ai chỉ có đúng một đường để tiếp cận nhà cung cấp OAuth — credential đã có sẵn trong `CredentialStore` của collection — không có bất kỳ fallback ambient nào cho nó; và `openai-codex` chính là nhà cung cấp duy nhất trong catalog đã cài chỉ khai báo `auth.oauth`, không có `auth.apiKey`. `PiAiAdapter.current()` dựng collection bằng `createModels()` không tham số, nên dùng `InMemoryCredentialStore` mặc định của pi-ai: mỗi lần khởi động đều trống, và mỗi lần cấu hình thay đổi sinh ra snapshot mới thì lại được dựng lại từ đầu. Không có nơi nào trong repo này gọi `Models.login()`; nửa còn lại của thư viện pi-ai cũng không đọc `~/.codex/auth.json` của riêng Codex — module OAuth của nó là một luồng đăng nhập PKCE, credential được lưu bền bởi ứng dụng *host* — đó chính xác là thứ mà pi CLI cung cấp, còn adapter này thì không.

Vì vậy, trang này dùng đúng tư thế "để trống" mà placeholder của nó mô tả, để cung cấp một nhà cung cấp vốn không hề có tư thế "để trống" nào cả — trong khi thông báo lỗi lại chỉ tới khóa cấu hình, chứ không phải năng lực còn thiếu. Cách duy nhất khiến tuyến này xác thực thành công là dán một ChatGPT OAuth token vào ô khóa — đó vừa không phải cách dùng mà trang này mô tả, token đó cũng sẽ hết hạn mà không có khâu nào ở đây làm mới nó.

## Quyết định

Danh mục chỉ cung cấp những gì adapter này nhận biết được. `catalogProviderTakesApiKey(provider)` trả lời câu hỏi nhà cung cấp mà pi-ai cài cho một tuyến có khai báo phương thức api-key hay không — đây là phương thức duy nhất mà harness có thể cung cấp, vì nó giải quyết khóa qua seam credential của chính mình, rồi đưa vào làm `apiKey` ghi đè trong request gửi cho pi-ai — `directoryEntries()` bỏ qua những tuyến trong catalog không thỏa điều kiện đó.

Không cố hiện thực OAuth. Việc đó cần kho lưu credential bền vững, luồng đăng nhập, và giao diện để chạy đăng nhập; cả ba đều không phải là điều bản sửa chặn phát hành này cần làm, và việc vẫn bày nhà cung cấp ra khi thiếu cả ba chính là nguyên nhân của báo cáo lần này.

Hai ranh giới thu hẹp phạm vi của việc "không cung cấp":

- **Tư cách thành viên trong catalog không đổi.** `catalogProviderIds()` vẫn trả lời pi-ai đã cài những gì, nên cờ `declared` trên mục danh mục vẫn có nghĩa là "không có nhà cung cấp đã cài nào tương ứng với tuyến này", chứ không phải "tuyến này không được cung cấp".
- **Nửa profile của liên hợp (union) được giữ nguyên vô điều kiện.** Tuyến mà tài liệu settings đã ghi vẫn giữ mục của nó, nên profile `openai-codex` đã lưu vẫn hiển thị, vẫn chỉnh sửa được, vẫn xóa được, chứ không bị kẹt lại trong tài liệu trong khi trang không có lối nào để gỡ nó ra.

Resolution không bị đụng tới. Một profile khai báo `apiKeyEnv` trên một tuyến chỉ-OAuth vẫn dựng ra được nhà cung cấp khả dụng — `routeAuth` sẽ bổ sung phương thức api-key của harness bên cạnh OAuth của catalog, còn Codex API của pi-ai thì suy ra account id từ chính token — nên bản triển khai nào đã ghi nó vào `settings.yaml` hoặc `cordis.yml` vẫn giữ được đường này. Nếu đổi sang bắt buộc từ chối trong `resolveProfiles`, việc đó sẽ phủ nhận loại profile này ngay tại lúc đăng ký; và vì `validate` chạy giống nhau cả lúc khởi động lẫn lúc ghi, một tài liệu đã ghi sẵn tuyến OAuth không có khóa sẽ khiến toàn bộ namespace đăng ký thất bại, chứ không chỉ một nhà cung cấp thất bại.

## Các phương án đã cân nhắc

- **Từ chối tuyến chỉ-OAuth không có khóa ngay trong `resolveProfiles`.** Đây mới đúng là chỗ mà repo này thường ép buộc quyết định, còn việc lọc danh mục chỉ là một lớp bề mặt có thể bị một entry `cordis.yml` vượt qua. Bị bác bỏ vì hành vi khởi động nói trên: một profile đã lưu sẽ kéo sập luôn mọi tuyến khác trong cùng namespace đó — với một bản phát hành, đây là đánh đổi khiếm khuyết của một nhà cung cấp lấy khiếm khuyết của toàn bộ. Khoảng trống còn lại: cái được sửa là "việc cung cấp" chứ không phải "năng lực" — bản triển khai vẫn có thể tự tay viết ra một tuyến mà trang đã không còn cho thêm được nữa.
- **Vẫn cung cấp, chỉ sửa lại dòng placeholder.** Khi đó ô nhập chỉ có thể viết "nhà cung cấp này cần đăng nhập mà bản build này không chạy được", tương đương một tấm thẻ mà nội dung trung thực duy nhất là "nó không dùng được".
- **Ánh xạ `Provider is not configured` thành một `LlmError` có tên riêng.** Đáng làm, và nguyên nhân kích hoạt nó vẫn chưa bị loại bỏ trong lần thay đổi này — bất kỳ tuyến api-key nào để trống khóa mà nhà cung cấp của nó cũng không tìm thấy gì trong môi trường tiến trình đều sẽ sinh ra cùng một thông báo đó. Tạm hoãn như một thay đổi độc lập: nó cải thiện phần chẩn đoán, chứ không loại bỏ một nhà cung cấp đang hỏng.
- **Đọc `~/.codex/auth.json` vào `CredentialStore` của pi-ai.** Cách này giúp Codex dùng được mà không cần luồng đăng nhập, việc làm mới token cũng do pi-ai lo. Nhưng nó buộc harness gắn với định dạng file riêng của một công cụ khác chỉ vì một nhà cung cấp — đó thuộc về quyết định của hạng mục công việc OAuth, không phải bản sửa trong giai đoạn phát hành.

## Ảnh hưởng

`openai-codex` biến mất khỏi bộ chọn nhà cung cấp, cũng như khỏi danh mục mà trang cấu hình model join vào; mọi nhà cung cấp đã cài khác đều không bị ảnh hưởng, kể cả sáu nhà cung cấp có cung cấp thêm OAuth *ngoài* phương thức api-key (`anthropic`, `github-copilot`, `kimi-coding`, `openrouter`, `radius`, `xai`) — chúng vẫn giữ mục của mình lẫn đường khóa. Về sau, nếu xuất hiện một nhà cung cấp chỉ có OAuth, nó sẽ tự động bị loại trừ, chứ không cần liệt kê tên thủ công.

Hai khoảng trống liền kề vẫn còn đó, và đã được ghi lại trong README của package: tuyến không chỉ định credential vẫn đi theo cơ chế tự phát hiện có sẵn của nhà cung cấp trong catalog, thứ chỉ đọc biến môi trường tiến trình — không đọc `~/.aws/credentials`, cũng không đọc seam credential của harness — và lỗi phát sinh từ đó vẫn là `PI_AI_ERROR` mặc định.

## Kiểm thử

Test trong package chốt cả hai nửa của liên hợp: tuyến không được cung cấp không xuất hiện trong `listConfigurableProviders()`, trong khi `anthropic` và `openai` vẫn còn; profile `openai-codex` đã lưu vẫn cho ra mục đầy đủ với `declared: false`. Các test resolution hiện có không bị sửa và vẫn pass, đó chính là bằng chứng cho thấy việc "không cung cấp" không thu hẹp phạm vi mà một profile viết tay có thể phục vụ. Hai golden e2e web `models-settings` và `onboarding-usable-provider` đúng là thiếu mất đúng một dòng tùy chọn `openai-codex`, được ghi lại từ ứng dụng đã lắp ráp thật.
