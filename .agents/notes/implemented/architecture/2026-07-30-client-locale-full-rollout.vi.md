# Agent Note: đưa toàn bộ văn bản client vào chỗ ngồi typed locale và ranh giới không dịch

Status: implemented

[English](2026-07-30-client-locale-full-rollout.md) | Tiếng Việt

## Problem

Sau khi chỗ ngồi chuẩn của typed locale (khai báo đăng ký `locale:` → framework tiêm `t` có kiểu chặt) được đưa vào, mới chỉ có bốn package tiên phong tiếp nhận; văn bản của các package client còn lại vẫn là những chuỗi ký tự hardcode trộn lẫn tiếng Trung và tiếng Anh. Việc di trú toàn bộ đòi hỏi vài cơ chế và quyết định ranh giới mà các package tiên phong chưa chạm tới: văn bản ở thời điểm đăng ký (label của hàng điều hướng, của tab khung nhìn) làm sao được làm mới khi đổi ngôn ngữ; các component nguyên tử ui-primitives thuộc zero-cordis lấy văn bản ở đâu; những chuỗi nào **cố ý không** được bản địa hóa — không ghi lại ranh giới sẽ khiến các agent (tác tử) tương lai bị cám dỗ "dịch cho trọn".

## Decision

**Văn bản ở thời điểm đăng ký đi qua label thunk.** Trường `label` của mục đăng ký dạng list trong ui-slots nhận `SlotLabel = string | (() => string)`; khi owner chiếu các hàng ledger thì bắt buộc phải phân giải qua `resolveSlotLabel` (không đọc trần `options.label`), và điểm đọc phải bám theo locale revision (bản thân outlet đăng ký theo dõi revision; các phép chiếu nằm ngoài ledger như điều hướng ui-settings thì gộp revision vào khóa cache và đăng ký theo dõi hai nguồn). Thunk được tính lại ở mỗi lần đọc, nên đổi ngôn ngữ không gây xáo trộn ledger — không đăng ký lại, version không đổi, toàn bộ dây nối đăng ký lại theo `locale/change` đều bị xóa.

**Văn bản của component đi qua chỗ ngồi `t` chuẩn; component con ở tầng sâu nhận qua prop truyền xuống**, kiểu viết là `XxxProps['t']`. Hình thái chuẩn của từ điển không đổi: `zh satisfies Record<string, string>` là nguồn key, `en satisfies Record<XxxKey, string>` khóa chặt sự cân bằng song ngữ.

**Văn bản của các component nguyên tử zero-cordis (ui-primitives) được đưa thành props**: `copyLabel`/`copiedLabel` của `HoverCard`, `labels` của `TerminalBlock`/`JsonTree`, `copyLabel`/`copiedLabel` của `CodeBlock`, `codeLabels` của `MarkdownText`, `truncatedLabel` của `JsonBlock`, `label` của `ConnectionBanner`, `closeLabel` của `Modal` — giá trị mặc định chính là chuỗi hardcode ban đầu, nên bên tiêu thụ không truyền props sẽ render giống hệt tới từng byte. Các plugin đã được bản địa hóa thì truyền label do từ điển điều khiển từ chỗ ngồi `t` của chính mình; những điểm gọi truyền props dạng object sẽ memo theo danh tính của `t` (bảng component của `MarkdownText` cache theo danh tính của `codeLabels`).

**Ranh giới không dịch (quyết định có chủ ý, không phải nợ kỹ thuật):**

- **Chuỗi thuộc nhóm lỗi/thất bại đều để tiếng Anh**: chuỗi dự phòng do client tự sinh (`command failed`, lỗi chuyển plan), thông điệp RpcError, và `error.message (code)` lộ ra từ wire đều hiển thị nguyên trạng.
- **Chuỗi thuộc thiết kế không vào từ điển**: tiêu đề variant của hàng công cụ (Think/Bash/…), huy hiệu kind kiểu SYSTEM/USER, chữ trên chip Plan, và toàn bộ StatsLine — giao diện tiếng Trung và tiếng Anh hiển thị như nhau.
- **Cả package ui-trajectory tạm hoãn** (mặt kiểm tra dành cho lập trình viên, dày đặc thuật ngữ, sẽ phân xử riêng).
- **Văn bản boot giữ nguyên hardcode** (AppRoot render trước khi dịch vụ locale sẵn sàng).

**Tầng dẫn xuất giữ nguyên hàm thuần, việc bản địa hóa chỉ nằm ở tầng render**: `relativeTime` của ui-workspace trả về `{unit, n}` có cấu trúc để tầng render ghép với mẫu trong từ điển; tiêu đề lưu trữ của session trống/nhóm chưa phân loại không đổi, còn khi render thì thay bằng văn bản bản địa hóa dựa trên cờ `blank`/sự vắng mặt của `workspaceId`; **các hàng blank luôn bị loại khỏi trạng thái tìm kiếm** (tiêu đề song ngữ không thể khớp ổn định với truy vấn đơn ngữ). Ngày tháng không dùng Intl: mẫu định dạng nằm trong từ điển (đồng hồ tin nhắn `clock.md`/`clock.ymd`, hover workspace `date.ymd`), còn hàm định dạng nhận tham số `t` để giữ tính thuần.

**Quy ước cho test và e2e**: `makeTranslate(...dicts)` (dsh-client-test-runtime) phản chiếu chuỗi tra cứu của dịch vụ (từ điển khớp đầu tiên thắng, key làm giá trị dự phòng, nội suy `{name}`), các bản giả lập `t` trong test component đều dùng nó và định kiểu theo đúng chỗ ngồi props thật. Test e2e của web đều mở qua `newEnglishPage` (trình duyệt `en-US`), và snapshot built-boot cũng cố định ngôn ngữ navigator: nhờ vậy golden không bị ảnh hưởng bởi việc di trú ngôn ngữ. Ca kiểm thử đổi ngôn ngữ trong settings thì đi vòng qua helper này và bật trình duyệt `zh-CN`, bởi trước khi tùy chọn Host tường minh tới nơi, locale tạm thời sẽ bám theo `navigator` ([suy ra locale ban đầu từ trình duyệt](../feature/2026-07-31-browser-derived-initial-locale.md)).

Cơ chế "tầng apply đăng ký theo dõi `locale/change` rồi đăng ký lại để làm mới label" trong [Note phân tầng settings/locale/theme](../../proposed/architecture/2026-07-25-client-settings-locale-theme.md) đã bị quyết định này thay thế (thunk + vòng đời revision).

## Alternatives considered

- **Giữ label là string và đăng ký lại khi đổi ngôn ngữ** (hình thái cũ của các package tiên phong): boot vốn đã đăng ký một lần cho mỗi package, việc listener `locale/change` đăng ký lại sẽ khuếch đại thành bão; ledger version dao động còn phá vỡ mọi phép chiếu cache theo version. Thunk dời chi phí làm mới về điểm đọc, mà điểm đọc thì vốn đã bám theo revision.
- **Tạo context/kênh tiêm locale cho ui-primitives**: phá vỡ ranh giới zero-cordis (từ đó component nguyên tử phụ thuộc vào runtime), và ép cả bên tiêu thụ chưa bản địa hóa (ui-trajectory) phải chạy theo. Việc đưa thành props cho phép mỗi bên tiêu thụ tự quyết định độc lập.
- **Đưa chuỗi lỗi vào từ điển**: mặt lỗi là mặt gỡ rối, để nguyên tiếng Anh là có lợi nhất cho việc tìm kiếm và đối chiếu khi báo cáo; hơn nữa chuỗi lộ ra từ wire vốn không thể dịch, dịch nửa vời chỉ tạo ra văn bản pha trộn ngôn ngữ.
- **Dùng `toLocaleString()`/Intl cho ngày tháng**: chúng bám theo ngôn ngữ của trình duyệt/OS chứ không phải ngôn ngữ của ứng dụng, nên sau khi đổi tất yếu sinh ra văn bản pha trộn; mẫu trong từ điển thì ít và đồng hình với đồng hồ tin nhắn.
- **Cho hàng blank tham gia tìm kiếm (khớp tiêu đề bản địa hóa hoặc tiêu đề lưu trữ)**: lựa chọn nào cũng dẫn tới cảnh "nhìn thấy mà tìm không ra" ở một ngôn ngữ nào đó; hàng giữ chỗ vốn không mang thông tin, nên loại trừ hoàn toàn là ngữ nghĩa ổn định nhất.

## Consequences

- Đổi ngôn ngữ làm mới tức thì toàn bộ UI và không cần đăng ký lại; tiếp nhận một package mới = từ điển + declare-merge + `locale: NS`, ba bước, không cần viết tay lớp keo nào.
- Cái giá phải trả: bên tiêu thụ label dạng list phải biết tới `resolveSlotLabel` (đọc trần `options.label` giờ có thể nhận về một hàm); về mặt kiểu, `SlotLabel` đã chặn được phần lớn trường hợp dùng sai.
- Giá trị mặc định tiếng Trung của ui-primitives vẫn là tiếng Trung ngay cả khi ngôn ngữ là tiếng Anh, **cho tới khi bên tiêu thụ truyền vào labels** — bên tiêu thụ JsonTree chưa di trú (ui-trajectory) hiển thị giá trị mặc định tiếng Anh của nó, vừa khớp với hiện trạng toàn tiếng Anh của cả package đó.
- Việc e2e ghim cứng tiếng Anh đồng nghĩa trạng thái mặc định zh chủ yếu được phủ bởi test component ở cấp package và ca kiểm thử đổi ngôn ngữ trong settings, còn e2e trình duyệt không còn kiểm chứng văn bản zh nữa.
