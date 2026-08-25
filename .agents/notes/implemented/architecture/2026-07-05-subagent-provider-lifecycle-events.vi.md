# Agent Note: Sự kiện vòng đời của bên cung cấp subagent — `subagent/provider-added` / `subagent/provider-removed`

Status: implemented

[English](2026-07-05-subagent-provider-lifecycle-events.md) | Tiếng Việt

## Vấn đề

[Agent Note về biến prompt](2026-07-05-prompt-variables-and-tool-guidance-ownership.md) khiến `dsh-tool-subagent` dẫn xuất văn bản hướng tới mô hình từ bên cung cấp của nó: `SubagentProvider.inheritsParentContext` (spawn và ACP (Agent Client Protocol) là `false`, fork là `true`) đồng thời điều khiển cả mô tả công cụ lẫn mô tả tham số `prompt`, khiến công cụ fork không còn nói dối mô hình về chuyện kế thừa ngữ cảnh. Bản sửa này tạo ra một phụ thuộc dữ liệu xuyên fiber: mô tả công cụ được cố định tại thời điểm đăng ký công cụ (đây là chủ ý — mô tả chính là nơi dẫn dắt tool-choice), nhưng bên cung cấp lại tới trên fiber plugin của riêng nó, vào thời điểm không xác định.

Nếu phân giải bên cung cấp ngay tại thời điểm `apply` của plugin công cụ, sẽ nảy sinh một yêu cầu ngầm về thứ tự nạp («đặt backend trước công cụ trong cordis.yml»). Yêu cầu này không đứng vững, vì Cordis Loader khởi động các mục ngang hàng một cách đồng thời, và `Entry.init()` không chờ quá trình kích hoạt hoàn tất: một backend tới muộn, dù được liệt kê trước, vẫn có thể làm fiber của công cụ thất bại. Loader không đưa ra bảo đảm nào về thứ tự giữa các mục ngang hàng — «trạng thái bất đồng bộ không phải trạng thái đồng bộ» (xem [mẫu phòng vệ](../../../../docs/defensive-patterns.md)).

## Quyết định

Sổ đăng ký phát sóng thay đổi thành viên của bên cung cấp dưới dạng sự kiện đã định kiểu, còn bên tiêu thụ phản chiếu các sự kiện đó thay vì giả định về thứ tự:

- **`subagent/provider-added(provider)`**: một bên cung cấp trở nên phân giải được trong sổ đăng ký `ctx.subagents`. Phát ra tại thời điểm đăng ký.
- **`subagent/provider-removed(name)`**: một bên cung cấp rời khỏi sổ đăng ký (fiber plugin của nó bị dispose (giải phóng tài nguyên) — gỡ bỏ hoặc nạp lại HMR (thay thế module nóng)). Phát ra từ disposer của lần đăng ký.

`dsh-tool-subagent` phản chiếu vòng đời của bên cung cấp được đặt tên của nó: đăng ký công cụ khi bên cung cấp khả dụng (hoặc trở nên khả dụng) — và dẫn xuất văn bản từ bên cung cấp đó ngay tại thời điểm ấy — hủy đăng ký công cụ khi bên cung cấp rời đi, và dẫn xuất lại khi đăng ký lại (nạp lại HMR). Khi bên cung cấp không có mặt thì công cụ không tồn tại, nên nó không nói dối mô hình. Ở đây, một cách có chủ ý, không để lại bất kỳ yêu cầu thứ tự nạp nào cần tài liệu hóa: sự kiện làm cho vấn đề thứ tự biến mất, chứ không đóng đinh nó lại.

Những sự kiện này còn hoàn thiện từ vựng của seam: `ctx.subagents` là một sổ đăng ký có tên, nơi nhiều backend ủy thác (`spawn`, `fork`, `acp`) cùng tồn tại; một sổ đăng ký mà các plugin khác dẫn xuất trạng thái từ nó thì nên phát sóng thay đổi thành viên bằng sự kiện đã định kiểu, thay vì đòi hỏi polling hoặc phụ thuộc vào thứ tự nạp.

## Các phương án đã cân nhắc

- **Phân giải bên cung cấp tại thời điểm `apply`, ném ngoại lệ nếu không tồn tại**: bác bỏ. Yêu cầu «liệt kê backend trước» tuyên bố một bảo đảm thứ tự mà Loader không hề có.
- **Thử lại việc tra cứu (polling cho tới khi bên cung cấp xuất hiện)**: cuối cùng cũng hội tụ, nhưng lại phát minh ra một giao thức sẵn sàng riêng nằm ngoài cơ chế đã có của framework (đăng ký effect + disposal); nó cũng không cảm nhận được việc bên cung cấp rời đi, nên HMR sẽ để sót lại một công cụ mà văn bản của nó mô tả một backend đã bị dispose.
- **Chỉ đặt văn bản subagent trong section, phân giải lười tại thời điểm lắp ghép**: cũng chịu được thứ tự nạp bất kỳ, nhưng lại chuyển phần dẫn dắt tool-choice ra khỏi mô tả, mâu thuẫn với quy tắc sở hữu mà Agent Note về biến prompt đã thiết lập (ngữ nghĩa của từng công cụ và thời điểm dùng nó thuộc về mô tả). Đăng ký theo kiểu phản ứng vừa giữ mô tả ở vị trí quyền uy, vừa không phụ thuộc thứ tự.
- **Xác định văn bản theo tên bên cung cấp thay vì theo đối tượng bên cung cấp**: bản thân `providerName` là cấu hình, nên bên cung cấp sau khi đổi tên sẽ âm thầm nhận văn bản sai; dẫn xuất từ chính `inheritsParentContext` của bên cung cấp đã phân giải thì không trôi lệch.

## Hệ quả

- Bên tiêu thụ dẫn xuất trạng thái từ bên cung cấp có tên sẽ phản ứng với sự kiện `subagent/provider-added`/`-removed`, thay vì đọc sổ đăng ký tại thời điểm `apply`; `dsh-tool-subagent` là bản triển khai tham chiếu.
- **Thất bại lớn tiếng khi thêm; cách ly theo listener khi gỡ.** Listener của việc thêm có thể quay lui phần đăng ký. Việc gỡ chạy trong lúc disposal, nên một listener đơn lẻ ném ngoại lệ chỉ bị ghi log, không làm đói các bên phản chiếu sau đó cũng như không cản trở quy trình tháo dỡ. `start()` vẫn phân giải bên cung cấp theo tên ở mỗi lần chạy, ngăn công cụ cũ gọi tới backend đã bị gỡ. Xem [danh mục sự kiện](../../../../docs/subsystems/subagent.md#cordis-surface) và [ánh xạ nhà sản xuất/bên tiêu thụ](../../../../docs/event-producer-consumer.md).
- **Khoảng thời gian công cụ không tồn tại.** Giữa lúc backend bị disposal và lúc đăng ký lại (trong khi nạp lại HMR), mô hình không nhìn thấy công cụ subagent. Đây là trạng thái trung thực — phương án thay thế là một công cụ điều phối vào khoảng không — và sự kiện `tools/change` do sổ đăng ký công cụ phát ra sẽ giữ cho việc lắp ghép prompt luôn cập nhật.
- **Hai fiber đang chờ dùng chung một `toolName` là cấu hình không hợp lệ, bị bắt trễ.** Nếu hai thể hiện nạp `dsh-tool-subagent` lần lượt chỉ định bên cung cấp khác nhau nhưng cùng một `toolName`, cả hai đều sẽ chờ, và bên cung cấp tới trước sẽ đăng ký trước; lần đăng ký thứ hai chỉ ném ngoại lệ khi bên cung cấp của nó tới. `TODO(subagent-dup-toolname)` trong plugin ghi lại phạm vi ảnh hưởng này; cơ chế từ chối trùng tên của sổ đăng ký công cụ vẫn là tuyến phòng thủ cuối cùng.
