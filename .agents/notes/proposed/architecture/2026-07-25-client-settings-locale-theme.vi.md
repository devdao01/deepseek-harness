# Agent Note: Phân tầng Client Settings, Locale và Theme

Status: proposed

[English](2026-07-25-client-settings-locale-theme.md) | 中文

## Vấn đề

Settings hiện có ở phía trình duyệt được viết trực tiếp bên trong Sidebar, còn ngôn ngữ và theme thì do state cục bộ của component sửa DOM trực tiếp. Điều này khiến Settings không thể được mở rộng bởi các plugin độc lập, trạng thái preference không có một service convention ổn định xuyên plugin, và registry theme phải gánh cả trách nhiệm trạng thái lẫn hiển thị.

## Đề xuất

**Định hướng phối hợp (cách mọi module sau này gia nhập Settings): chủ sở hữu tính năng tự đăng ký.** Vỏ (shell) Settings là một mặt phẳng tổ hợp thuần túy: chỉ khai báo slot, render cấu trúc chrome, không có text, không phụ thuộc locale, không import cũng không liệt kê bất kỳ tính năng nào; một tính năng muốn xuất hiện trong Settings, phải do chính plugin của nó đăng ký vào slot tương ứng — locale đăng ký hàng Language, ui-theme đăng ký hàng Appearance, ui-settings-models đăng ký panel cấp một Models. Không mở riêng gói `ui-settings-*` cho "trang settings của một tính năng": mặt settings thuộc về chính gói tính năng đó (làm tính năng Theme thì lựa chọn settings của Theme đi kèm luôn với ui-theme). Nội dung không thuộc về tính năng đơn lẻ nào (text chrome của trigger/tiêu đề/close, thư mục General và các hàng khung sườn, từ điển `settings`) do `ui-settings-general` sở hữu — nó là chủ sở hữu của "văn bản vô chủ", không phải gói vệ tinh của một tính năng.

Sidebar khai báo single slot `sidebar.settings`, `ui-settings` chiếm slot đó và khai báo bốn slot: `settings.trigger` / `settings.header` / `settings.close` (chỗ chứa nội dung chrome, single) và `settings.section` (trang cấp một, list). Tên hỗ trợ tiếp cận (accessible name) đều được giải quyết từ nội dung slot: tên hỗ trợ tiếp cận của trigger chính là nội dung text của nó, dialog dùng aria-labelledby trỏ đến node nội dung header, close là chỗ chứa text ẩn về mặt thị giác. Mỗi section do plugin tính năng đóng góp; vỏ chỉ đọc entry metadata từ slot ledger để sinh navigation, render section hiện tại qua `only`. General do `ui-settings-general` đăng ký (order 0) và khai báo list slot `settings.general.item`, các hàng preference của plugin tính năng được xếp vào theo order.

Điểm vào Settings là hàng Settings ở Foot của sidebar, click sẽ mở trực tiếp một lớp phủ (overlay) căn giữa kích thước 1080×700 (mặt nạ đen 24%); nút close, click vào mặt nạ, ESC đều đóng được. Không có bất kỳ dạng menu trung gian nào.

`@deepseek-ai/dsh-client-locale` cung cấp `ctx.locale`, `ui-theme` cung cấp `ctx.theme`. Cả hai service đều đọc bằng getter, ghi bằng setter, và phát snapshot bất biến qua typed Cordis change event; service tự bền vững hóa preference (chỉ lưu id, giá trị không hợp lệ sẽ fallback về default).

Tầng apply của hàng tính năng tự subscribe change event của mình (locale subscribe `locale/change`, ui-theme subscribe `theme/change`), chiếu snapshot vào slot store đã khai báo khi hàng đó đăng ký. Component React chỉ đọc `useStore`, ghi qua setter callback được tiêm vào, không đọc ctx hay service.

Preference của Theme có ba trạng thái: `light`, `dark`, `system`, mặc định `system` (khi không có preference bền vững hoặc giá trị không hợp lệ). Việc giải quyết system thuộc về lĩnh vực theme: ThemeRuntime giữ listener matchMedia của `prefers-color-scheme` (nhận biết môi trường, không phải hiển thị DOM), khi preference là system và bảng màu hệ thống thay đổi thì phát lại snapshot; snapshot mang theo cả `preference` lẫn định nghĩa `active` đã được giải quyết.

Service Theme không thao tác DOM. `ui-layout` đọc getter Theme lúc khởi tạo, sau đó subscribe `theme/change`, presenter do Layout giữ cập nhật `body[data-ds-dark-theme]` và các token theme theo `active`; presenter không nhận biết system, chỉ tiêu thụ kết quả đã được giải quyết.

### Các mặt đăng ký ở giai đoạn đầu

| Mặt đăng ký | Plugin sở hữu | Nội dung giai đoạn đầu |
|---|---|---|
| Nội dung chrome (trigger/header/close) | `ui-settings-general` | Icon+text của hàng điểm vào settings, tiêu đề panel, text ẩn của close |
| Section General (order 0) | `ui-settings-general` | Khung sườn thị giác Permission, Tool Call (không có thao tác ghi) + khai báo slot `settings.general.item` |
| Hàng Language (item order 0) | `locale` | Dropdown selector, chuyển đổi thật giữa Trung/English |
| Hàng Appearance (item order 10) | `ui-theme` | Ba cube Light/Dark/System chuyển đổi thật (trạng thái chọn xem theo preference) |
| Section Models (order 10) | `ui-settings-models` | Chỉ có mục navigation, vùng nội dung trống; chức năng quản lý model sau này sẽ nằm ở gói này |
| Plugin | Không có | Giai đoạn đầu chưa làm, navigation không hiện mục này (gói tính năng plugin sau này đăng ký section sẽ tự động xuất hiện) |

Giai đoạn đầu chỉ bản địa hóa (localize) text bên trong lớp phủ Settings; từ điển được đặt gần nơi dùng — chrome + khung sườn General thuộc namespace `settings` của `ui-settings-general`, text hàng tính năng thuộc các gói tính năng tương ứng (`settings.locale`, `settings.theme`, `settings.models`).

### Cấu trúc topology của slot

```text
root
└─ sidebar
   └─ sidebar.settings                   single/root
      └─ ui-settings（vỏ, không có text）
         ├─ settings.trigger             single/root  ui-settings-general đăng ký
         ├─ settings.header              single/root  ui-settings-general đăng ký
         ├─ settings.close               single/root  ui-settings-general đăng ký
         └─ settings.section             list/root
            ├─ general (order 0)         ui-settings-general đăng ký
            │  └─ settings.general.item  list/root
            │     ├─ language (0)        locale đăng ký
            │     └─ appearance (10)     ui-theme đăng ký
            └─ models (order 10)         ui-settings-models đăng ký
```

Đóng góp section/item dùng `ctx.slots.inject()`, không phụ thuộc thứ tự apply của client manifest (bản khai metadata); label bản địa hóa đi qua label thunk của [Agent Note triển khai toàn diện](../../implemented/architecture/2026-07-30-client-locale-full-rollout.md). Kiểu SlotMap được tách riêng: trigger/header/close/section đặt tại convention của ui-settings (bên tiêu thụ general/models đều phụ thuộc vỏ, không tạo vòng); `settings.general.item` đặt tại gói locale — đó là phụ thuộc chung thấp nhất của mọi bên đăng ký item (hàng settings nào cũng phải có text), còn convention của bên khai báo general thì locale/ui-theme không thể vươn tới (sẽ tạo vòng); ui-theme tiêu thụ qua điểm re-export.

### Khai báo slot là đối tượng chờ có thể tiêm bậc nhất

`SlotRegistry.inject()` chờ trực tiếp một key ledger có ràng buộc kiểu; nó không bắc cầu khai báo thành một Cordis service tổng hợp `slot:<name>`. Callback sẽ theo khai báo bị gập lại và khai báo lại, còn bộ điều khiển của nó vẫn thuộc về fiber của plugin đóng góp; đăng ký trực tiếp vào slot chưa khai báo vẫn báo lỗi trực tiếp. Điều này xóa bỏ máy trạng thái "đang tồn tại" dựa trên disposer cũ, cũng như namespace service song song dễ sai do gõ nhầm. Vòng đời đầy đủ và convention thất bại xem [quyết định tiêm khai báo slot](../../implemented/architecture/2026-08-05-slot-declaration-injection.md).

### Service convention

```ts
export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeDefinition {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: Record<string, string>
}

export interface ThemeSnapshot {
  preference: ThemePreference
  active: ThemeDefinition            // system đã được giải quyết thành định nghĩa light/dark cụ thể
  themes: readonly ThemeDefinition[]
  revision: number
}

export interface LocaleDefinition {
  id: 'zh' | 'en'
  label: string
}

export interface LocaleSnapshot {
  active: 'zh' | 'en'
  locales: readonly LocaleDefinition[]
  revision: number
}

export interface Events {
  /** @param snapshot - Current locale registry snapshot. @mode emit */
  'locale/change'(snapshot: LocaleSnapshot): void
  /** @param snapshot - Current theme registry snapshot. @mode emit */
  'theme/change'(snapshot: ThemeSnapshot): void
}
```

Locale có sẵn tiếng Trung và English; `setLocale`/`setTheme` là điểm ghi duy nhất, id không xác định sẽ thất bại.

## Các phương án thay thế đã cân nhắc

**Để app shell subscribe preference thống nhất và render lại toàn bộ root slot tree.** Thay đổi ngôn ngữ và theme chỉ cần cập nhật bên tiêu thụ thực sự; refresh toàn cây sẽ mở rộng phạm vi ảnh hưởng, và cũng kéo preference nghiệp vụ vào shell.

**Service Theme sửa DOM trực tiếp.** Service registry khi đó phụ thuộc vào môi trường hiển thị, vòng đời và quyền sở hữu style toàn cục không rõ ràng; Layout đã sở hữu ranh giới hiển thị gốc của trang.

**System được giải quyết bởi Layout presenter.** presenter sẽ phải tự mang theo subscription matchMedia và chọn định nghĩa cụ thể trong danh sách themes, buộc tầng hiển thị phải hiểu ngữ nghĩa preference; đặt việc giải quyết ở phía service thì mọi bên tiêu thụ đều nhận được snapshot đã giải quyết nhất quán.

**Settings import và liệt kê từng section.** Trang mới phải sửa plugin vỏ, phá vỡ mô hình tổ hợp "mỗi tính năng chiếm slot bằng plugin của chính nó".

**Mở riêng gói vệ tinh `ui-settings-*` cho mỗi section theo tính năng.** Mặt settings tách rời khỏi bản thân tính năng: sửa hành vi Theme phải động vào hai gói, số lượng gói tăng tuyến tính theo số mục settings, và gói vệ tinh lại phụ thuộc ngược vào service locale/theme, tạo ra một tầng trung gian sinh ra chỉ để tách gói. Dưới mô hình chủ sở hữu tính năng tự đăng ký thì tầng này không tồn tại: hàng preference đi kèm cùng gói tính năng; `ui-settings-general` chỉ nhận text vô chủ (chrome và khung sườn General), không mang mặt settings của bất kỳ tính năng nào.

**Tiêm snapshot Locale/Theme trực tiếp vào React.** Kết quả inject được cache theo entry identity, giá trị dễ đổi sẽ trở nên lỗi thời; tự tạo React hook riêng cho từng service cũng bỏ qua việc gắn kết thống nhất của slot store.

## Tiêu chí nghiệm thu

- Vỏ Settings chỉ phụ thuộc slot ledger, không phụ thuộc bất kỳ triển khai tính năng nào; danh sách item của General cũng chỉ phụ thuộc ledger.
- Thêm một mục settings mới = gói tính năng tự đăng ký (section hoặc general item), không cần sửa vỏ.
- Việc ghi Locale và Theme chỉ đi qua setter, đồng bộ liên tục chỉ đi qua change event.
- Store của hàng tính năng khởi tạo qua getter, sau đó được cập nhật bởi change event của chính nó và render lại cục bộ.
- Layout tự áp dụng snapshot Theme độc lập, service Theme không truy cập DOM; presenter không xuất hiện nhánh system.
- Trung/English và Light/Dark/System có thể chuyển đổi và khôi phục sau khi refresh; khi preference là system, thay đổi bảng màu hệ thống có hiệu lực ngay lập tức.
- Models chỉ có mục navigation và vùng nội dung trống; khung sườn Permission, Tool Call không có thao tác ghi.
- Lớp phủ có thể đóng qua nút close, click vào mặt nạ, ESC.

## Rủi ro

Thứ tự apply của khai báo slot và contribution không cố định, mọi bên đăng ký section/item phải dùng `ctx.slots.inject()`, không được dùng service hay disposer cục bộ làm tín hiệu "đang tồn tại". Service event có thể đến sớm hơn lần render đầu của hàng, việc init store của hàng tính năng và attach của inject đều phải căn theo getter để khớp với snapshot hiện tại. Bản sao trùng lặp được gộp của `settings.general.item` (locale, ui-theme) phải khớp từng chữ với bản gốc ở ui-settings, hễ lệch là phải sửa cả ba nơi cùng lúc. Khi Layout unmount phải dọn dẹp thuộc tính toàn cục mà chính nó đã đặt, khi ThemeRuntime dispose (giải phóng tài nguyên) phải gỡ listener matchMedia, tránh tồn đọng sau HMR (thay thế module nóng).
