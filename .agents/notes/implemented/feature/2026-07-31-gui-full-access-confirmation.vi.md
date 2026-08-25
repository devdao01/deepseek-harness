# Agent Note: Xác nhận rủi ro GUI Full access

Status: implemented

[English](2026-07-31-gui-full-access-confirmation.md) | 中文

## Vấn đề

Trong bộ chọn quyền hạn của client Web, chuyển sang `danger-full-access` chỉ cần một cú nhấp chuột, và preset được hiển thị bằng tên máy (machine name) dạng Title Case `Danger Full Access`. Full access giảm bớt các bước xác nhận, cho phép agent thực hiện các thao tác nhạy cảm, sửa file hoặc chạy lệnh bên ngoài — một cú nhấp nhầm sẽ bật preset nguy hiểm nhất mà không có bước xác nhận có chủ đích nào.

## Quyết định

**Mỗi bộ chọn quyền hạn đều nhốt `danger-full-access` vào hộp thoại `RiskConfirmation` dùng chung trong trang: nút kích hoạt vẫn bị vô hiệu hóa cho đến khi người dùng tick vào checkbox xác nhận rủi ro rõ ràng; preset hiển thị bằng nhãn sản phẩm `Full access`; mọi đường hủy đều không submit bất cứ điều gì.**

- `RiskConfirmation` (ui-primitives) là một tổ hợp Modal có kiểm soát: tiêu đề, mô tả, checkbox xác nhận, hủy, và nút xác nhận bị vô hiệu hóa cho đến khi `acknowledged` được tick. Nó luôn là hộp thoại trong trang — Modal được portal vào body của chính tài liệu này, không bao giờ mở cửa sổ trình duyệt gốc (native) hoặc độc lập có thể rơi vào một màn hình khác.  `Modal` bổ sung slot `contentClassName`, để phần nội dung cảnh báo có thể cuộn trong viewport di động/màn hình ngang bị hạn chế, trong khi hàng nút hành động vẫn cố định.
- composer chip (`PermissionSelect` của ui-conversation) chặn lựa chọn Full-access trước khi submit `/permission`: trạng thái component `confirmation`/`acknowledged` mở hộp thoại, sau khi xác nhận thì submit `/permission danger-full-access` qua đúng kênh `command` được bơm vào giống hệt các lựa chọn khác; hủy, Escape, đóng và nhấp vào lớp phủ đều giữ nguyên preset hiện tại và reset checkbox. Khi phiên bị khóa, xác nhận tự thu hồi (effect `locked`/giá trị vắng mặt), và reset khi chuyển tác vụ do remount lại với `key={sessionId}`. Văn bản được cung cấp qua slot locale `conversation` chuẩn với các khóa `access.confirm.*`.
- popup `/permission` (ui-permission xây trên khung ui-commands) hiện thực chốt hoàn tất bằng dữ liệu chứ không phải một bộ hộp thoại thứ hai: `SelectOption` bổ sung một payload `confirmation` tùy chọn, popup controller sở hữu quá trình chuyển trạng thái `confirming`/`acknowledged`, `PopupSelectView` thay thẻ lựa chọn bằng chính `RiskConfirmation` đó trong lúc tùy chọn bị chặn còn treo lơ lửng.
- Hàng "Quyền hạn" trong cài đặt "Chung" cũng dùng chung `RiskConfirmation` có kiểm soát đó trước khi lưu Full access làm giá trị mặc định cho các phiên sau này. Lời cảnh báo nói rõ rằng cài đặt này chỉ ảnh hưởng đến các phiên sau; hủy, Escape, đóng và nhấp vào lớp phủ đều không thay đổi giá trị mặc định đã lưu.
- `Full access` cố ý ghi đè phép biến đổi hiển thị kebab-sang-Title-Case trong mỗi bộ chọn; lệnh và việc ghi vào Settings vẫn giữ tên máy trên wire, và mỗi đoạn văn bản cảnh báo vẫn nhận biết locale tiếng Trung/tiếng Anh.

## Các phương án thay thế đã cân nhắc

**Xác nhận gốc/hệ điều hành hoặc cửa sổ độc lập.** Bị từ chối: hộp thoại phải nằm trong cửa sổ WebUI hiện tại; một cửa sổ thứ hai có thể xuất hiện trên một màn hình khác, khiến quyết định tách rời khỏi trạng thái trang mà nó đang bảo vệ.

**Dùng chung một locale namespace cho văn bản an toàn ở mỗi giao diện.** Không áp dụng: bundle ui-permission và ui-conversation có thể tải độc lập, còn lời cảnh báo của Settings mô tả một chu kỳ hiệu lực khác — chỉ ảnh hưởng đến các phiên sau này. Mỗi bundle sở hữu văn bản riêng của mình, và ui-permission cũng tách từ điển popup và Settings ra riêng, thay vì import xuyên biên giới bundle.

**Chốt ở host/backend quyền hạn.** Về mặt thiết kế nằm ngoài phạm vi: thay đổi này chỉ liên quan đến luồng xác nhận ở client trình duyệt; ngữ nghĩa quyền hạn, giá trị mặc định, và hành vi một-cú-nhấp của các preset an toàn hơn ở backend đều không đổi.

## Hệ quả

Mọi đường GUI hiển thị dẫn đến Full access giờ đều yêu cầu xác nhận có chủ đích và có hiểu biết, đổi lại người dùng thực sự muốn bật preset này phải qua thêm một bước hộp thoại. Các bộ chọn mới tái sử dụng hộp thoại dùng chung thông qua máy trạng thái riêng của mỗi bên, hoặc gắn payload `confirmation` vào đường popup. Nghiệm thu: các test case chốt luồng editor trong `input-bar.spec.tsx`, chốt popup trong `popup-view.spec.tsx` và `popup.spec.ts`, chốt cài đặt mặc định trong `permission-row.spec.tsx`, quy ước Modal/RiskConfirmation trong `atoms.spec.tsx`, cùng phiên bản replay Web ở trạng thái lắp ráp.
