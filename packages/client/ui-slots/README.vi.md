# @deepseek-ai/dsh-client-ui-slots

[English](README.md) | Tiếng Việt

Registry slot thuần lõi, thiết kế slot terminal: declaration merging của SlotMap, API tổ hợp `register` duy nhất trên SlotCore, họ kiểu props của bốn share thành phần, họ kiểu store seat, cùng giao ước cài đặt renderer. Chỉ dùng kiểu của React; gói này không phụ thuộc React, cũng không phụ thuộc Cordis.

Một lệnh gọi `register({ name, children?, store?, inject?, ...kind }, Component)` đóng góp một component vào slot đã khai báo, đồng thời khai báo các slot con (khai báo = ủy quyền render = quy phạm runtime, cả ba dùng chung một bảng), store seat và tầng nghiệp vụ của bên đăng ký. Component được kiểm tra kiểu ngay tại điểm gọi dựa theo `ComposedProps`; kiểu này là giao của bốn share, mỗi share đều dẫn xuất từ nguồn chân lý duy nhất của riêng nó:

| share | Kiểu | Nguồn |
|---|---|---|
| runtime | `PropsRuntime<K>` | Mục SlotMap: `owner` (điểm gọi renderSlot của cấp cha) + bộ công cụ chuẩn của phiên + seat toàn cục |
| child render | `PropsRenderSlots<S>` | Tập key `children` của lệnh gọi register (`renderSlot` được thu hẹp tĩnh) |
| store | `PropsStore<H>` | Handle đã khai báo: hook selector `useStore` + `actions` đã bỏ draft |
| business | `I` | Suy ra từ giá trị trả về của `inject` factory |

Slot kiểu chain đảo ngược định tuyến theo key: các mục tự đề cử thay vì để điểm phân phối chọn `entryKey`. Mỗi lần đăng ký mang theo một selector `ChainSelect` thuần (kèm `priority` tăng dần tùy chọn, giá trị bằng nhau thì xử lý theo thứ tự đăng ký); giá trị trả về khác null đầu tiên sẽ chọn mục đó và trở thành prop `matched` của component; khi tất cả đều trả về null thì dùng fallback `renderSlotChain` của owner (`ChainRenderOpts`).

Các interface của bộ công cụ chuẩn (`SessionStandardProps`, `GlobalStandardProps`) được khai báo rỗng ở đây và do các gói runtime hợp nhất vào (cùng mẫu declare-merge như key của SlotMap). Renderer sẽ ràng buộc phiên runtime và observable source của Workspace thành các hook selector. Tham số của inject factory dẫn xuất từ khai báo (`InjectParams`): slot phiên nhận `sessionId`; khi khai báo store thì bổ sung thêm `actions` đã baked; không có tham số nào khác, việc truy cập dữ liệu nằm trong ctx của closure apply.

Họ store (đầu vào là quy phạm `defineStore`, đầu ra là `StoreHandle<T, A>`) mô hình hóa store seat: `init` suy ra schema trạng thái; `actions` là tập ghi draft-transform đầy đủ; `BakedActions` bỏ tham số draft, trở thành callback mà component và inject factory nhận được. Phần cài đặt giá trị của `defineStore` nằm ở gói runtime (nơi engine thuộc về) và thỏa mãn giao ước `DefineStore` được export tại đây. Sản phẩm của engine và giao ước renderer host mang theo source snapshot trần (`getSnapshot`/`subscribe`), tuyệt đối không mang hook của React; việc ràng buộc hook thuộc về cơ chế render, chỉ có kiểu hook trong giao ước props (`SnapshotSelectorHook`) nằm ở đây.

`SlotCore` khởi tạo sẵn slot `'root'` lúc dựng và thực thi kiểm tra tại thời điểm load (đăng ký vào slot chưa khai báo, khai báo trùng mục con, dùng cùng một handle chia sẻ dưới hai scope, đăng ký chain thiếu `select` — tất cả đều ném lỗi ngay khi register). Disposer của một mục sẽ gỡ đệ quy các slot con mà nó khai báo: dòng sổ cái, phần đóng góp và điểm gắn store đều bị gỡ theo cùng một vòng đời kết thúc. Mỗi key còn mang theo một declaration epoch (thế hệ khai báo), chỉ tăng khi khai báo và khi gỡ bỏ; runtime dùng nó cho [`ctx.slots.inject`](../runtime/README.md#slot-declaration-injection) và nó độc lập với phiên bản mục thông thường. `renderer.ts` mang giao ước cài đặt (`SlotRenderer`, `SlotRendererHost`) cùng `StaleAuthorizationError`/`SlotOwnershipError`; phần cài đặt nằm ở web-react, còn việc lắp đặt hoàn tất trong quá trình khởi động vỏ ngoài.

## Trải nghiệm mô hình

Không có. Registry slot thuộc về phần đấu nối UI phía trình duyệt; ở đây không có nội dung nào đi vào yêu cầu gửi mô hình.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Hạn chế đã biết và phần tạm hoãn

- **`isLive` quét tuyến tính toàn bộ bản ghi**: ở quy mô đăng ký của plugin UI (vài chục mục) thì không thành vấn đề; nếu sổ cái trở nên bị truy cập thường xuyên, hãy cải thiện bằng tham chiếu ngược mục→bản ghi.
- **Neo ảo `__renders` lộ ra trên `PropsRenderSlots`**: đây là loại nhiễu giống hệt `__accepts` trong thiết kế chuỗi kiểu và đã được chấp nhận; chữ ký phương thức generic khá lỏng khi so sánh giữa các union key, nên buộc phải dựa vào dấu hiệu nghịch biến để thực thi «tập key của component ⊆ khai báo children».
