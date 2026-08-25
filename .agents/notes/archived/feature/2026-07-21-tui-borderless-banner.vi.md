# Agent Note: Banner quay trở lại, không viền

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-borderless-banner.md) | 中文

## Problem

Một thiết kế trung gian không-banner đã xóa bỏ banner khởi động có khung viền: nó xóa `HeaderComponent` cùng animation quét của nó, chuyển model xuống footer, bỏ session id, và render `welcome` như dòng đầu tiên của transcript (bản ghi văn bản). Phán quyết của người dùng đã đảo ngược toàn bộ điều này: đưa banner quay lại — "just remove the border" (chỉ cần bỏ viền đi). Thứ gây khó chịu là bốn dòng viền hộp, chứ không phải thông tin nhận diện mà nó mang theo (model, session id), cũng không phải hiệu ứng quét.

## Decision

- `HeaderComponent` cùng animation quét từ trái sang phải của nó quay trở lại, nhưng được render **không viền**: không có góc `╭─╮`/`╰─╯`, cũng không có cạnh bên `│`. Mỗi dòng là một khoảng trắng đầu dòng cộng với nội dung đã được cắt bởi `truncateToWidth`, do đó phép cắt chiều rộng khi quét sẽ không bao giờ làm rách chuỗi escape, và cũng không vẽ bất kỳ viền cố định nào. Việc quét hoàn tất sau khoảng 24 khung hình, mỗi khung cách nhau 15 ms.
- Header mang tiêu đề (`DEEPSEEK HARNESS`), một dòng chi tiết `<model>  •  <session-id>`, và — khi `welcome` được thiết lập — một dòng phụ đề mờ (dimmed). Khi `welcome` không được thiết lập, header chỉ có tiêu đề cộng chi tiết: không có slogan cố định hay ngẫu nhiên nào.
- Model **đồng thời** vẫn được giữ ở đoạn bên trái của footer, do đó sau khi banner lướt ra khỏi tầm nhìn trong thời gian ngắn, model đang được session sử dụng vẫn có thể thấy thoáng qua.
- `welcome` được khôi phục làm phụ đề của banner; thông báo ở dòng đầu tiên của transcript bị xóa khỏi `rebuildTranscript`.
- Animation quét chỉ chạy khi `welcome` không được thiết lập. Khi có cấu hình `welcome`, toàn bộ banner được render ngay lập tức, giúp fixture và snapshot giữ tính xác định theo khung hình. Việc quét bắt đầu sau khi `ui.start()` thành công, và được dọn dẹp qua cùng đường dẫn `detachListeners` như trước, thông qua `stopBannerReveal`; hàm này cũng reset phép cắt, khiến header bị hủy giữa chừng khi đang quét sẽ được render lại đầy đủ.

Agent Note này gộp lại kết luận hiện tại của một vài phương án khởi động đã bị loại bỏ: hiệu ứng máy đánh chữ hiện từng ký tự với slogan ngẫu nhiên, animation quét toàn banner có viền, và việc loại bỏ banner hoàn toàn. Bản lắp ráp mẫu (example) không thiết lập `welcome`; các deployment và fixture xác định vẫn có thể cung cấp giá trị này. Vị trí thường trực cho model ở footer mà phương án không-banner thiết lập vẫn được giữ lại.

## Alternatives considered

**Giữ hộp nhưng làm mỏng đi hoặc dùng ký tự nhẹ hơn.** Bị từ chối: chỉ dẫn là "just remove the border" (chỉ cần bỏ viền đi); bất kỳ ký tự bao quanh nào cũng là kiểu trang trí viền mà người dùng phản đối.

**Giữ slogan ngẫu nhiên hoặc cố định khi `welcome` không được thiết lập.** Bị từ chối: văn bản mang tính "gia vị" lặp lại nhanh chóng mất giá trị thông tin, còn việc hiện dần từng ký tự chỉ tạo animation cho một dòng, lại chậm. Do đó, khi `welcome` không được thiết lập thì không hiển thị phụ đề, và toàn bộ banner đảm nhiệm hiệu ứng khởi động.

**Loại bỏ banner hoàn toàn.** Bị từ chối: footer thường trực rất phù hợp để hiển thị model, nhưng không thể mang đủ chi tiết nhận diện; đưa `welcome` vào transcript còn khiến nội dung hiển thị cấu hình trông như nội dung hội thoại.

**Hiện banner từ trên xuống dưới.** Bị từ chối: chia thành bốn bước theo bốn dòng trông giống nhấp nháy. Việc cắt chiều rộng theo phương ngang tận dụng không gian ngang của terminal để tạo hiệu ứng mượt mà, đồng thời tái sử dụng đường dẫn cắt nhận biết ANSI.

**Vì banner đã hiển thị lại model, nên bỏ model khỏi footer.** Bị từ chối: banner chỉ tồn tại trong thời gian ngắn, sẽ lướt đi cùng transcript, còn footer giữ model hiển thị suốt toàn bộ session; vị trí thường trực này được cố ý giữ lại.

**Không đưa session id vào banner.** Bị từ chối: sau khi bỏ hộp, dòng chi tiết chỉ chiếm một dòng, và người dùng yêu cầu banner "giống như trước", mà trước đây nó mang `model • session-id`.

## Consequences

- Đầu ra khởi động khi `welcome` không được thiết lập lại phụ thuộc vào animation (quét); khi có cấu hình dòng chào mừng thì giữ tính xác định theo khung hình, do đó mỗi snapshot và fixture kịch bản đều giữ một phụ đề cố định.
- Demo không còn cung cấp nội dung chào mừng mang tính hướng dẫn; `welcome` không được thiết lập đồng nghĩa banner không có phụ đề, còn cấu hình đó vẫn là phương tiện để deployment và fixture có được đầu ra xác định.
- Model giờ xuất hiện hai lần khi khởi động — ở chi tiết banner và ở footer — đây là sự dư thừa có chủ đích: banner tồn tại ngắn, footer thường trực.
- `/clear` xóa transcript nhưng không xóa header, do đó banner và phụ đề đã cấu hình của nó tồn tại sau `/clear`, khác với dòng chào mừng dựa trên transcript.
- Toàn bộ snapshot terminal của pi-tui và snapshot replay của examples/tui-agent được ghi lại (`test:snapshot:refresh`): dòng banner quay lại dưới dạng ký tự không hộp; dòng footer giữ tiền tố model.
- Mọi thứ neo vào việc banner vắng mặt được đổi sang neo vào sự hiện diện của nó: bài smoke test PTY dùng id `main-session-` trong dòng chi tiết làm marker khởi động (nó chỉ được hiển thị ở giai đoạn cuối của quá trình quét), và khẳng định `DEEPSEEK`/`HARNESS` xuất hiện mà không có góc hộp.

## Testing

`packages/ui/tui/tests/tui.spec.ts` ghim: banner không viền quét đến khi hoàn tất tự nhiên — không có góc hộp, tiêu đề và chi tiết `main-session` xuất hiện — và có ít nhất một khung hình giữa chừng bị cắt trong quá trình quét; `welcome` đã cấu hình sẽ render toàn bộ banner ngay và không có khung hình bị cắt; banner không có phụ đề khi `welcome` không được thiết lập; việc hủy (destroy) giữa chừng khi đang quét sẽ dọn dẹp timer của quá trình quét. Một test riêng về color scheme (bảng phối màu) bao phủ việc chuyển đổi sáng/tối do terminal báo cáo, no-op khi cùng một bảng phối màu, và terminal ném lỗi khi ghi truy vấn DSR; `applyColorScheme` dựa vào `setStatus` để suy luận lại viền editor, thay vì lặp lại phép gán vô nghĩa từng khiến độ phủ theo từng file không đạt. Bài smoke test PTY của tui-agent và dsh CLI dùng marker chi tiết `main-session-` làm marker khởi động và khẳng định không có góc hộp. Snapshot xác minh toàn bộ khung hình.
