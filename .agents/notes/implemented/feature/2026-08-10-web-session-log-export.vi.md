# Agent Note: Web export log phiên — host stream tải xuống ZIP

Trạng thái: implemented

[English](2026-08-10-web-session-log-export.md) | 中文

## Vấn đề

Khung nhìn Trajectory không có cách nào để đưa artifact debug vào tay con người: session log gốc nằm trên đĩa và ở phía host, panel lịch sử phía client chỉ cung cấp phần đã chiếu (projection) sau khi gấp lại (chứ không phải sự kiện gốc), và các phiên có subagent trải rộng trên nhiều session log độc lập với nhau. Báo cáo lỗi cần log gốc đầy đủ của toàn bộ cây phiên, và định dạng phải vẫn dùng được sau khi được chuyển tiếp.

## Quyết định

- **Export là một bề mặt tải xuống phía host, không phải RPC**: `GET /api/session.export?sessionId=…&includeDescendants=true` trả về dạng stream một tệp đính kèm ZIP. Mỗi tệp là **nguyên văn artifact lưu trữ** của phiên: persistence service có thêm `readRaw` đọc byte đã lưu trữ của chính backend (backend jsonl giải mã khung zstd vật lý của nó, hoặc trả về plaintext trực tiếp) — hoàn toàn không tái tạo từ sự kiện đã parse, do đó việc đóng gói chunk, thứ tự khóa, xuống dòng đều được giữ nguyên từng byte — đặt dưới tên tệp cơ sở gốc của nó (gốc là `session.jsonl`, subagent là `subagents/<id>/session.jsonl`). Việc nén dùng API `Zip`/`ZipDeflate` dạng stream của fflate ở phía host và `sessionExportCompressionLevel` đã validate 0–9 (mặc định 6), cho phép bản triển khai đánh đổi giữa CPU/độ trễ và kích thước lưu trữ; mỗi entry được nén ngay khi sinh ra theo từng chunk có giới hạn, response được ghi ra khi từng chunk được tạo, host không bao giờ đưa toàn bộ archive vào một buffer duy nhất (ngoài phần gốc được preload, nó chỉ giữ tối đa văn bản artifact của một descendant cùng lúc). Khi đạt mốc cao 64 KiB byte response, việc sinh dữ liệu sẽ chờ Consumer pull để khôi phục dung lượng; callback đồng bộ của fflate nhiều nhất chỉ push thêm một lần input có giới hạn ngoài giới hạn hàng đợi đó. Không ghi manifest — mỗi tệp đã nhất quán từng byte với artifact lưu trữ, và tự mô tả qua chính dòng header của nó.
- **Từ vựng lỗi mang tính HTTP nguyên bản**: service thiếu → 500, backend không cung cấp artifact gốc theo từng phiên → 501, phiên gốc không tồn tại → 404 (cả ba đều được xác định trước khi có byte nào được stream ra), descendant thiếu artifact lưu trữ → stream thất bại (fail-loud, không bao giờ export thiếu một cách âm thầm). Việc hủy request vẫn giữ ngữ nghĩa cancel chứ không bị đổi thành 500; việc hủy request và việc hủy response Consumer hội tụ vào một signal của producer, signal đó lan tới việc đọc lineage, persistence và attachment, và chấm dứt bộ nén đang hoạt động. Lớp vận chuyển (`toFetchHandler`) đã áp hàng rào tin cậy cho `/api`; nhánh GET nằm song song với route SSE GET hiện có, được `ApiProxy.downloads.sessionLog` (host-only, không có envelope wire, không nằm trên `IApiClient`) hiện thực hóa.
- **UI chỉ chịu trách nhiệm tải xuống**: Consumer phía trình duyệt có thể phát trước một `HEAD` preflight không đọc body để lấy lỗi ở giai đoạn chuẩn bị, rồi giao endpoint GET cho trình quản lý tải xuống gốc của trình duyệt, do đó JavaScript không buffer ZIP. RPC `session.log` được phát hành ở vòng lặp trước đó đã bị xóa — endpoint tải xuống là Consumer duy nhất của nó, và quy tắc của repo là không để lại interface công khai không có chủ sở hữu hiện tại. Bundle phía client không chứa bất kỳ hiện thực đóng gói archive nào.
- Header hiện tại và Consumer `/export` được định nghĩa bởi [Quyết định về lệnh export và hộp thoại Web](2026-08-11-web-export-command-and-dialog.md).

## Phương án khác đã cân nhắc

- **RPC dữ liệu `session.log` + đóng gói phía client** — được phát hành trước, sau đó bị bác bỏ cùng người dùng: trình duyệt phải tải toàn bộ JSON gốc (khoảng gấp 10 lần zip cuối cùng) và nén trên main thread; với các phiên ở mức khoảng 23 MB trong thực tế sử dụng, streaming từ host luôn tốt hơn hẳn. RPC này bị xóa cùng lúc với việc di chuyển, thay vì để lại như một interface công khai không có Consumer.
- **Dùng dòng envelope để mã hóa nhiều phiên vào một JSONL duy nhất** — bị bác bỏ cùng người dùng: trộn nhiều phiên vào một JSONL sẽ mất đi ranh giới tệp sạch sẽ; ZIP giữ cho mỗi phiên là một tệp chuẩn tắc.
- **jszip** — nặng hơn (khoảng 100 kB), đồ thị dependency còn kéo theo bản ánh xạ trình duyệt của readable-stream; fflate được sinh ra riêng cho việc này và nhỏ gọn.
- **Vendor bản trình duyệt của fflate vào repo** — quy trình vendoring của repo hướng đến source code cố định ở cấp cordis; alias resolveId giữ cho dependency đang được bảo trì mà không cần copy code (fflate phía host thậm chí không cần alias).

## Hệ quả

- Độ trung thực của export: trước khi đọc mỗi phiên gốc đang chạy hoặc descendant, bộ export đi qua hàng rào persistence thẩm quyền `SessionStore.flush`; mỗi tệp export nhất quán từng byte với artifact lưu trữ thu được từ đó. Phiên đang chạy có thể append tiếp sau khi tự đọc, do đó archive là một snapshot theo ranh giới đọc của từng phiên, chứ không phải snapshot nguyên tử của toàn bộ cây. Gói nén tên `dsh-session-<sanitized-id>.zip`, đường dẫn archive được làm sạch id phiên trước khi tạo hình entry.
- `supportsRawArtifacts` phân biệt rõ khả năng của backend với việc phiên không tồn tại: các backend không hỗ trợ như SQLite báo cáo `false`, `readRaw` cụ thể mặc định sẽ từ chối; còn bản ghi đè JSONL báo cáo `true`, tự giải mã vật lý, và chỉ dùng `undefined` để biểu thị artifact không tồn tại. `ApiProxy.downloads.sessionLog` thêm một thành viên host-only mới vào hợp đồng, cùng một query schema phía host, và thêm một nhánh GET vào fetch handler — không có dòng RPC map, envelope schema, hay mặt `IApiClient` phía client.
- Ở chế độ fixture (không có host), export trả về 404, trình duyệt sẽ báo đây là lỗi tải xuống; snapshot golden của navigation-panes có chứa nút "Export".
- Hoãn lại: transcript.md cũng như đóng gói report/feedback để lại cho sau. Hình dạng trung thực từng byte, không manifest giúp việc mở rộng đóng gói ở v2 duy trì chi phí thấp.
