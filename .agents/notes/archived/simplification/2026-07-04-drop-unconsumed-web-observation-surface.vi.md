# Agent Note: Gỡ bề mặt quan sát web không được tiêu thụ — sự kiện `providers-change` và các phương thức status

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-drop-unconsumed-web-observation-surface.md) | Tiếng Việt

## Vấn đề

`WebService` phơi bày một nhóm bề mặt quan sát mà không mã production nào theo dõi:

- **`web/providers-change`** (`packages/web/web/src/index.ts`) được khai báo và phát ra mỗi lần nhà cung cấp đăng ký và dispose (giải phóng tài nguyên), và lệnh yield hoàn tác của mỗi effect đăng ký được cố ý xếp trước lệnh emit, với mục đích duy nhất là để một change listener ném lỗi có thể hoàn tác việc đăng ký. Ngoài hai bài kiểm thử đơn vị của chính package đó thì không có listener nào (một trong hai bài kiểm thử tồn tại chỉ để cố định đúng thứ tự hoàn tác ấy).
- **`searchStatus()` / `fetchStatus()` cùng kiểu hợp `WebCapabilityStatus`** (cùng package) không có bên gọi production nào: `dsh-tool-web` thực thi trực tiếp qua `ctx.web.search()`/`fetch()`, và biểu diễn tình trạng không khả dụng bằng mã `WebError` có cấu trúc mà seam ném ra lúc thực thi (`packages/web/tool-web/src/search.ts`, `packages/web/tool-web/src/fetch.ts`); bên gọi status duy nhất là kiểm thử của chính package web. Phần nội dung trong `packages/web/tool-web/README.md` và [architecture.md](../../../../docs/architecture.md) khẳng định rằng công cụ "chỉ đọc `searchStatus()`/`fetchStatus()` đã tổng hợp" — sự trôi lệch này tồn tại được chỉ vì không có cơ chế nào đối chiếu văn bản với các vị trí gọi thật.

Chính thiết kế của seam khiến hai bề mặt này tự nhiên không có consumer: việc đăng ký công cụ đi theo ENABLEMENT của sản phẩm chứ không theo tính khả dụng của nhà cung cấp (`packages/web/tool-web/src/index.ts`), còn việc chọn nhà cung cấp được phân giải lúc thực thi và không bao giờ được cache — nên không có cache nào cần vô hiệu hóa, không có tập đăng ký nào cần tính lại, và không bên gọi nào cần một phép dò khả dụng khác với «thực thi rồi định tuyến lỗi có cấu trúc». Việc dọn dẹp HMR (thay thế module nóng) do chính effect disposer đảm nhiệm.

Điều này hô ứng với [việc bỏ sự kiện `llm/adapter-change` không ai tiêu thụ](2026-06-20-drop-unconsumed-llm-adapter-change-event.md); Agent Note đó đã gỡ khỏi `LlmService` đúng hình thái thông báo ấy, đúng cơ chế hoàn tác trước khi emit ấy, và đúng bài kiểm thử listener ném lỗi ấy. Tiêu chí giữ/xóa của Agent Note (bản ghi quyết định của agent) đó là: giữ `tools/change` cho những consumer danh sách công cụ có thể hướng tới người dùng, và xóa tín hiệu registry backend lúc khởi động. Theo tiêu chí này, registry nhà cung cấp web rõ ràng thuộc về phía bị xóa; còn các phương thức status là việc áp dụng cùng phán quyết ấy lên bề mặt kéo (pull) thay vì bề mặt đẩy (push).

## Quyết định

Gỡ sự kiện thay đổi registry, các phương thức status tổng hợp cùng kiểu của chúng, và các bài kiểm thử chuyên dụng cho chúng. Status riêng tư của nhà cung cấp vẫn được giữ để phục vụ việc chọn lựa lúc thực thi. Độ bao phủ hướng về bên gọi giờ khẳng định việc thực thi thành công hoặc lỗi lựa chọn có cấu trúc, còn tài liệu web mô tả contract gọi theo nhu cầu ấy.

## Các phương án từng cân nhắc

### Vì sao không giữ lại?

Agent Note về web seam đã cố ý quy định cả hai — sự kiện làm tín hiệu hiển thị HMR tối thiểu, và các phương thức status làm chẩn đoán tổng hợp cho công cụ — và trong tương lai cũng có thể hình dung ra một bảng trạng thái nhà cung cấp. Nhưng chính những lựa chọn khác trong cùng Agent Note đó đã tước đi điều kiện sinh tồn của chúng: việc suy ra lựa chọn ngay lúc gọi và việc đăng ký dựa trên trạng thái bật khiến không consumer nào có thể cần tới bất kỳ thứ nào trong hai thứ đó; công cụ đã phát hành cho thấy mẫu hình thực tế (thực thi rồi định tuyến lỗi có cấu trúc); còn câu văn bị trôi lệch trong README cho thấy consumer từng được hứa hẹn chưa bao giờ xuất hiện. Theo AGENTS.md, "Agent Note là đề xuất, không phải chân lý tuyệt đối"; mã nguồn về sau đã chứng minh những phần này của đề xuất vượt quá nhu cầu; người quan sát trong tương lai nên dựa trên hình thái của consumer thật mà đưa lại tín hiệu hoặc truy vấn tối thiểu mà nó thực sự tiêu thụ.

## Kiểm chứng

Ngoài lịch sử Agent Note, không còn tồn tại cách viết `providers-change`, `searchStatus`, `fetchStatus` hay `WebCapabilityStatus`; danh mục vẫn tươi mới (`verify-cordis-catalog` màu xanh); kiểm thử an toàn HMR khi đăng ký/giải phóng chứng minh việc dọn dẹp thông qua hành vi thực thi; đoạn README của tool-web và đoạn kiến trúc cũng mô tả đúng contract định tuyến lỗi lúc thực thi mà công cụ thực sự có.

## Hệ quả

Nếu tương lai có UI chọn nhà cung cấp hoặc bảng chẩn đoán cần thông báo thay đổi hay truy vấn status, nó sẽ tự thêm lại bề mặt tối thiểu mà chính nó tiêu thụ; cùng phán quyết đó và các điều kiện đảo ngược của nó đã được ghi lại trong tiền lệ LLM (mô hình ngôn ngữ lớn).
