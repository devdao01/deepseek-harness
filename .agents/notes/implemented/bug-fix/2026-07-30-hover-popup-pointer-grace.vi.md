# Agent Note: Grace period cho pointer trên hover popup

Status: implemented

[English](2026-07-30-hover-popup-pointer-grace.md) | 中文

## Vấn đề

Hai loại popup xuất hiện từ dòng workspace browser đều nằm ở vị trí mà pointer không thể chạm tới. `HoverCard` đóng ngay ở `pointerleave` đầu tiên khi pointer rời khỏi anchor, và card của nó còn đặt `pointer-events: none`; nhưng card lại nằm cách mép phải anchor 8px, nên mọi đường đi tới card đều phải băng qua vùng không thuộc anchor cũng không thuộc card, khiến card bị hủy trước khi pointer kịp tới nơi — đường dẫn workspace đầy đủ và session title lẽ ra nó phải hiển thị chỉ thoáng qua trong chớp mắt. Menu thao tác trên dòng truyền vào `closeOnPointerLeave`, còn handler của nó lại gắn trên list đã được teleport: đưa pointer quay lại nút trigger `...` đã mở list này sẽ đóng list, pointer vượt qua mép list cũng đóng list tương tự, và không có bất kỳ cửa sổ quay đầu (turn-back) nào.

## Quyết định

`usePointerGrace` ([packages/client/ui-primitives/src/pointer-grace.ts](../../../../packages/client/ui-primitives/src/pointer-grace.ts)) giữ đúng một lần đóng trễ có thể hủy, được chia sẻ bởi hai atom component, với `POINTER_GRACE_MS` là 200. Rời đi sẽ khởi động việc đóng, quay đầu lại sẽ hủy nó. Nhờ đó pointer có thể an toàn băng qua khoảng trống giữa anchor và popup, trong khi pointer thực sự rời đi vẫn sẽ đóng popup.

`HoverCard` khi rời đi sẽ khởi động grace period thay vì đóng ngay lập tức, card của nó cũng không còn đặt `pointer-events: none`, nên pointer dừng trên card là đủ để giữ nó mở. Việc quay lại khi đang mở chỉ hủy lệnh đóng đang chờ, chứ không khởi động lại bộ đếm dừng lại (dwell timer), nhờ đó tránh việc card nhấp nháy khi pointer băng qua khoảng trống. Nhấn pointer trên card dùng để bắt đầu chọn text, sẽ không đóng card; chỉ khi thao tác nhấn xảy ra trong vùng anchor, hoặc owner đặt `disabled` thành true, card mới bị đóng ngay lập tức, vượt trước cả grace period.

`Menu` chuyển việc xử lý đóng khi pointer rời đi từ list đã teleport sang span bao ngoài. Việc duyệt enter/leave của React dựa trên cây React, nên ở đây trigger button và list đã teleport thuộc cùng một vùng: băng qua khoảng trống 4px giữa chúng, hoặc đưa pointer quay lại trigger button, đều không còn tính là rời đi. Chỉ khi list đang mở mới khởi động việc đóng khi rời đi; việc đóng do owner điều khiển (chọn, Escape, click bên ngoài) sẽ giải trừ lệnh đóng-do-grace đang chờ trong một effect chỉ phụ thuộc vào `open` — nếu gộp việc này vào effect của click bên ngoài thì mỗi lần re-render sẽ hủy grace period, vì owner mỗi lần đều truyền vào một closure `onClose` mới.

## Các phương án đã cân nhắc

**Chỉ đóng hai loại popup này qua click bên ngoài và Escape.** Bác bỏ: cả hai đều được gọi ra bởi hover, và không có dấu hiệu đóng nào hiển thị; để chúng ở lại sau khi pointer đã chuyển sang dòng khác sẽ khiến card bị bỏ lại trên nội dung không liên quan.

**Mở rộng vùng hit của anchor để nó chạm tới popup.** Bác bỏ: độ lệch 8px và 4px đến từ design, và một phần tử cầu nối vô hình còn phải theo kịp mỗi lần định vị lại mà hai popup fixed-position này đã thực hiện khi scroll và resize cửa sổ.

**Giữ `pointer-events: none` cho hover card, chỉ thêm grace period.** Bác bỏ: như vậy khi pointer dừng trên card, nó sẽ chạm phải phần tử phía sau card, grace period vẫn hết hạn, và đóng card mà user vừa mới chạm tới được.

**Để hai atom component tự giữ timer riêng.** Bác bỏ: hai chỗ đóng này là cùng một hành vi, cùng một bộ tham số điều chỉnh; hook dùng chung ngăn chúng lệch nhau theo thời gian.

## Hệ quả

Hover card giờ có thể chạm tới được, trong lúc hiển thị nó sẽ che 244px vùng phủ của nó — đó là cái giá của khả năng chạm tới; nó vẫn chỉ tồn tại khi pointer nằm trên dòng hoặc trên card. Row menu giờ chịu được việc pointer đi qua lại giữa trigger button và list, còn menu bị đóng vì lý do riêng của nó khi mở lại cũng sẽ không bị lệnh đóng còn sót lại đóng luôn. Menu không đặt `closeOnPointerLeave` không bị ảnh hưởng — chỉ khi đặt thuộc tính đó mới gắn handler ở lớp bao ngoài.

## Kiểm thử

`packages/client/ui-primitives/tests/hover-card.client.spec.tsx` và `tests/atoms.spec.tsx` cố định kiểm chứng ranh giới grace period, việc quay đầu hủy lệnh đóng, không khởi động lại dwell timer, giải trừ lệnh đóng đang chờ khi owner đóng, và không khởi động việc đóng khi list đã đóng. Bản thân cử chỉ khả năng chạm tới — đưa pointer lên card, và di chuyển giữa list đang mở với trigger button của nó — được `apps/web/tests/workspace-management.e2e.ts` cố định kiểm chứng trong trình duyệt thật, vì chúng phụ thuộc vào hit-testing và layout mà jsdom không thể mô phỏng.
