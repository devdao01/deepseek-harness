# Agent Note: Khung giao diện tiếp quản của bước onboarding lần đầu chuyển vào chính bước đó

Status: implemented

[English](2026-08-06-onboarding-step-owned-takeover-chrome.md) | 中文

## Vấn đề

Settings shell treo khung giao diện tiếp quản (takeover chrome) cho onboarding lần đầu ngay khi `settings.onboarding` có bước đã đăng ký và chưa hoàn tất cục bộ — một lớp phủ portal vào body, với lớp hiển thị (display layer) đục màu `--dsw-alias-bg-layer-1`, lớp che mờ (blur mask), và đặt `#root` thành `inert`. Trong khi đó mỗi bước đều phải nạp sự kiện riêng trước khi tự xác định có cần xuất hiện hay không (WelcomeNotice: đọc cờ xác nhận qua join settings của nó; DeepSeekOnboardingDialog: đọc trạng thái credential sẵn sàng qua join Models), và render `null` trong lúc chờ xác định. Render `null` không thể ẩn khung giao diện, vì lớp hiển thị đục màu đó do shell vẽ ở bên ngoài slot outlet, không thuộc về bước.

Kết quả là mỗi lần reload trang ở trạng thái hero (trống hoặc không có phiên), ngay khi danh sách phiên chuyển sang `ready`, một lớp đục toàn màn hình bật lên — màu trắng ở theme sáng — chặn mọi tương tác, kéo dài đúng bằng một vòng round-trip RPC credential/settings; sau đó bước đã cấu hình xong tự hoàn tất, lớp phủ biến mất. Người dùng thấy đúng một lần chớp trắng mỗi khi trang reload ngay tại thời điểm workspace/danh sách phiên vừa sẵn sàng.

## Quyết định

Khung giao diện tiếp quản thuộc về bước, không thuộc về shell. Thêm một primitive cordis mới (ui-primitives) gọi là `OnboardingSurface`: render lớp phủ/mask/lớp hiển thị portal vào body — class CSS và hình học được chuyển nguyên văn từ `SettingsRoot.module.css` — và giữ `#root` là `inert` trong suốt lifecycle mount của chính nó. Hai component bước chỉ bọc nhánh **hiển thị** của riêng mình vào trong primitive đó; nhánh `null` sẵn có nhờ vậy về mặt cấu trúc không vẽ gì, không chặn gì, vì khung giao diện đã là một phần của cùng quyết định render đó.

Coordinator của `SettingsRoot` giữ nguyên (chiếu ledger có thứ tự, mỗi lần mount một bước, tập hợp hoàn tất cục bộ, currency `stepId`/`complete`/`openSection`), nhưng render trần bước đang được chọn — không còn portal, lớp hiển thị và hiệu ứng inert. Quy ước slot của `settings.onboarding` giờ ghi rõ: bên đăng ký nắm giữ lớp bọc ngoài, và phải render `null` khi sự kiện riêng chưa được xác định.

## Các phương án thay thế đã từng cân nhắc

**Đăng ký có điều kiện (ledger chính là tín hiệu có nội dung hay không).** Chỉ đăng ký entry sau khi join riêng đã phân giải ra kết quả "cần can thiệp". Sạch về kiến trúc (publish tại commit point), nhưng thay đổi lớn hơn: việc nạp join phải chuyển từ dialog lên `apply` của từng plugin, đăng ký/hủy trở thành nối dây phản ứng (reactive) ở cả hai package. Quá nặng cho một bug như thế này, đã bị bác bỏ.

**Đổi `settings.onboarding` thành chain và đưa tập hợp hoàn tất ra ngoài thành store.** Đây là mẫu hình của composer takeover; đã làm prototype rồi rút lại. Selector chỉ có thể phán đoán dựa trên props của owner, sự kiện riêng về việc đã sẵn sàng vẫn chỉ có thể phân giải bên trong component — chain mua được tính tổng quát trong routing mà hai bước hiện tại không cần, cái giá phải trả là thay đổi quy ước xuyên ba package.

**Dò output của slot rỗng ngay tại điểm render.** `renderSlot` luôn trả về phần tử outlet vô điều kiện, owner không thể phân nhánh dựa trên `null` của bước. Việc dò DOM đã render có rỗng hay không đòi hỏi thủ thuật commit-rồi-rollback, việc lật trạng thái động đó sẽ mất đi đảm bảo trước-khi-paint.

## Hệ quả

Trong lúc bước đã mount nhưng chưa xác định xong, ứng dụng vẫn hiển thị và tương tác được: trong cửa sổ chờ xác định, `#root` không còn là `inert` (trước đây nó ở trạng thái inert phía sau lớp phủ đục). Đối với người dùng thực sự chưa cấu hình, lớp tiếp quản xuất hiện muộn hơn trước đúng một vòng round-trip join — nhưng khi xuất hiện thì đã có nội dung, chứ không còn lộ ra lớp hiển thị trống rồi mới điền nội dung vào sau.

Trong tương lai nếu có bước đăng ký mà không bọc nội dung hiển thị của mình vào `OnboardingSurface`, nó sẽ render trần không có mask đè lên ứng dụng; JSDoc của quy ước slot đã ghi rõ việc bọc là nghĩa vụ của bên đăng ký.

## Kiểm thử

`packages/client/ui-primitives/tests/onboarding-surface.client.spec.tsx` chốt hành vi của primitive: portal vào body bọc nội dung, class mask/lớp hiển thị tồn tại, `#root` chỉ `inert` đúng trong suốt lifecycle mount, và tổ hợp không có `#root`. `packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` chốt quy ước shell sau khi đảo ngược: khi bước đã mount không render gì, không có khung giao diện tiếp quản, không có inert. `apps/web/tests/onboarding-deepseek-config.e2e.ts` thêm một chốt hồi quy lắp ráp toàn bộ cho đúng bug này: reload trang trong thế giới đã cấu hình sẵn, đồng thời giữ lại mọi phản hồi `settings.describe` ngay tại ranh giới mạng của trình duyệt — kéo giãn cửa sổ xác định của bước từ mức không nhìn thấy được dưới loopback lên đến hàng trăm mili giây, đây chính là điều kiện then chốt để assertion không bị rỗng — bộ lấy mẫu 8ms trong trang chứng minh khung giao diện tiếp quản chưa từng được mount, `#root` chưa từng chuyển sang inert. Các kịch bản sẵn có của file này cùng spec của các bước (`ui-settings-general`, `ui-settings-models`) vẫn pass nguyên vẹn — stylesheet được chuyển nguyên văn, selector mask và chốt hình học vẫn còn nguyên.
