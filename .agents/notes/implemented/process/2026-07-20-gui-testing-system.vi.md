# Agent Note: Hệ thống test GUI — cấu trúc ba lớp

Status: implemented

> Cập nhật đường dẫn (2026-07-22, tái cấu trúc hệ thống plugin): triết lý ba lớp và phương pháp golden path của tài liệu này vẫn còn hiệu lực; nơi ở đã chuyển — spec lớp đối tượng hiện nằm ở `packages/client/runtime/tests/` (trước là web-runtime), spec wire hiện nằm ở `packages/client/connection/tests/`, miễn trừ coverage của `web-ui` biến mất cùng package (spec component là các bộ jsdom suite thuộc từng `packages/client/*/tests/`). Hình thái spec component tuân theo [chuẩn slot type chain](../architecture/2026-07-22-slot-type-chain-implementation.md): props nạp trực tiếp — phần store lấy từ `createXXXStore().create()` (engine thật, con đường không cần cơ chế phụ trợ được chấp nhận), hook framework dùng stub thường; không cơ chế render, không mount provider. Ngữ nghĩa quyền sở hữu/registry của slot thuộc địa phận lớp 2 (bộ suite `runtime` + `ui-slots`), không thuộc spec component.

[English](2026-07-20-gui-testing-system.md) | 中文

> Đường phân công: bài này chỉ nói về cấu trúc test đặc thù của GUI (`packages/{client,host}/*` + `apps/web`); chính sách test toàn repo (nguyên tắc phân lớp, chính sách with-key, ưu tiên triển khai thật, REAL-composition) xem [docs/testing.md](../../../../docs/testing.md), không nhắc lại ở đây.

## Problem

GUI stack cần xem xét nhiều hình thái ứng dụng, và trong cùng một hình thái ứng dụng lại có nhiều môi trường vận hành khác nhau (Node host, lớp giao thức dữ liệu, lớp đối tượng trình duyệt, React/DOM), test theo một hướng duy nhất không thể cho tín hiệu hiệu quả. Cần test hiệu quả cho từng khâu, đồng thời phải có năng lực nền tảng cho test full-chain.

## Decision

Chia theo các điểm móc test tự nhiên của kiến trúc thành ba lớp, từ dưới lên trên:

| Lớp | Đối tượng được test | Biện pháp then chốt | Vị trí file |
|---|---|---|---|
| 1 Lớp đồng cấu giao thức | `AbstractApiClient` + `toFetchHandler` (dữ liệu hai chiều/rpcId/kiểu ZOD/luồng SSE (Server-Sent Events)/gộp batch/timeout) | **Toàn chuỗi tại điểm đồng cấu**: `InProcessApiClient(toFetchHandler(impl đã kịch bản hoá))` không qua mạng nhưng chạy thật serialization wire — zero trình duyệt, env node thuần | `packages/host/apiproxy/tests/client-handler.spec.ts` |
| 2 Điều phối lớp đối tượng | `Session`/`SessionManager`/`ConnectionController` (máy trạng thái và trình tự: khâu nối/khử trùng/phân trang/xoá nháp lạc quan/pendingBuffers/kết nối lại/backoff) | **Golden path «chuỗi sự kiện vào → snapshot ra»**: thể giả có thể lập trình + deferred kiểm soát trình tự + fake timer kiểm soát backoff | `packages/client/{runtime,connection}/tests/` |
| 3 Lớp lắp ráp hiển thị | Sản phẩm build × client loader thật kết hợp với plugin | Semantic snapshot thuộc về ứng dụng sẽ khởi động toàn bộ 8 plugin client đã build trong jsdom, điều khiển thay đổi trạng thái xuyên plugin một cách xác định; ngoài ra còn có smoke test Playwright tối giản chịu trách nhiệm xác minh biên trình duyệt thật/lớp gánh, case host thật tự bỏ qua khi không có key; lane e2e trình duyệt không key sẽ vô hiệu hoá dòng model adapter trong cấu hình triển khai, và thông qua `dsh-llm-replay` replay lại fixture phiên đã ghi (dữ liệu tiền đề test) trong quá trình lắp ráp web ở tiến trình thật, đối chiếu với output kỳ vọng aria của khu vực phiên ([lane e2e web](../testing/2026-07-24-web-gui-browser-e2e-lane.md), [gate CI bắt buộc](../testing/2026-07-30-web-browser-snapshot-ci-gate.md)) | `apps/web/tests/*.snapshot.ts`, `apps/web/tests/smoke-{fixture,real}.e2e.ts`, `apps/web/tests/{replay-round-trip,seeded-history}.e2e.ts` |

Kỷ luật giữa các lớp: **mỗi lớp test phần của mình, lớp trên không test lại lớp dưới**: semantic snapshot ứng dụng chỉ cố định phần projection người dùng nhìn thấy trên biên plugin sau khi lắp ráp, smoke test Playwright chịu trách nhiệm xác minh trình duyệt và lớp gánh còn sống hay không; ngữ nghĩa wire thuộc lớp 1, ngữ nghĩa dữ liệu thuộc lớp 2. Lớp hàm thuần (lineage/partial/notifier/transcript-adapter) test trực tiếp zero thể giả cùng package tests/ với lớp 2.

- Cả **source host và client** đều được đưa vào gate coverage 100% per-file toàn repo, chỉ loại trừ một số ít ngoại lệ cấp trình duyệt có comment trong `vitest.config.ts`; bộ suite component chạy qua pragma jsdom theo từng file và Testing Library, không làm thay đổi bộ suite Node.
- **Semantic snapshot thuộc về ứng dụng** đọc client bundle đã build, thực thi chúng qua loader thật, và chỉ điều khiển các hook fixture xác định. Chúng chịu trách nhiệm cố định các trạng thái ổn định người dùng nhìn thấy như nhãn sidebar, breadcrumb và `document.title`, chứ không cố định pixel CSS hay chi tiết máy trạng thái ở lớp dưới.

## Bản đồ lane

| Kịch bản | Lệnh | Nội dung | Khi nào chạy |
|---|---|---|---|
| Cơ bản | `pnpm run test:gui` | vitest lớp 1+2 (`packages/client packages/host`), tốc độ giây, không trình duyệt, không server | Chạy tuỳ ý sau khi sửa source GUI bất kỳ |
| Semantic snapshot | `DSH_EXAMPLE_MODE=lib pnpm run test:snapshot` | Ngữ nghĩa ứng dụng đã lắp ráp không cần key, và output kỳ vọng chia theo hình thái transport của repo | Sau thay đổi GUI người dùng nhìn thấy; trước khi bàn giao |
| End-to-end trình duyệt | `pnpm run test:web` | Build lại dist frontend trước, rồi chạy toàn bộ 3 lớp trình duyệt: smoke test hai cấp (cấp fixture + cấp host thật tự bỏ qua) cộng với kịch bản e2e replay không cần key (`DSH_SNAPSHOT=record`/`refresh` ghi lại fixture / viết lại output kỳ vọng) | Sau khi sửa bề mặt build/boot/lớp gánh; trước khi bàn giao |
| Gate output kỳ vọng trình duyệt | `DSH_SNAPSHOT=replay pnpm run test:web:built` | Tái sử dụng sản phẩm CI đã build, và so sánh từng output kỳ vọng trình duyệt đã commit mà không ghi đè | Mỗi pull request Linux |
| Gate | `pnpm run test:coverage` | Gate toàn repo (cả package GUI host và client, chỉ loại trừ ngoại lệ cấp trình duyệt có comment) | Cửa sổ PR (Pull Request) |

**Phân công giữa script trình duyệt và vitest**: Playwright chịu trách nhiệm hồi quy hộp đen trình duyệt/lớp gánh và các luồng thao tác người dùng liên tục dài hơn; vitest thường chịu trách nhiệm ngữ nghĩa lớp dữ liệu như tính ổn định tham chiếu, trình tự và cấu trúc wire; snapshot vitest thông qua tổ hợp đã build chịu trách nhiệm output ngữ nghĩa lớp ứng dụng ổn định. Các lane này bổ sung cho nhau, không lặp lại assertion của nhau.

## Kỷ luật phòng hồi quy

- **Sửa một bug thì đóng đinh một assertion**: bug nhìn thấy được ở trình duyệt đóng đinh vào spec trình duyệt tương ứng (smoke test hoặc kịch bản e2e); bug lớp dữ liệu đóng đinh vào spec tương ứng (tiền lệ: phán đoán sai res-close đóng đinh trong webserver bridge suite — tái hiện thuần Node ở tốc độ giây, không còn cần sentinel trình duyệt 12s làm phòng tuyến duy nhất).
- **Fixture xanh toàn bộ chưa xong, wire thật cũng phải qua**: cái mà fixture đi tắt chính là chuỗi gánh wire (ngữ nghĩa close bridge node:http, trình tự mạng thật), cả hai bug đã được thực chứng đều ẩn ở đó. Thay đổi chạm vào connection/bridge/handler/SSE thì bắt buộc phải chạy lane trình duyệt (`pnpm run test:web`) — kịch bản e2e không key của nó điều khiển phần gánh HTTP/SSE thật, còn smoke test host thật có key vẫn là bổ sung ở phía model thật.
- Quy trình đối chiếu code lên đĩa là câu trả lời: khi thay đổi hành vi làm case sẵn có bật đỏ, đối chiếu ngay tại chỗ (sửa test hay sửa code do RFC/quy ước phán quyết), không để lại đỏ treo.

## Consequences

Mỗi lane test riêng lớp của mình: sau khi sửa source GUI bất kỳ đều nhận được phản hồi `test:gui` ở tốc độ giây, ngữ nghĩa lớp wire/đối tượng được assertion ở mức mili giây trong môi trường Node, snapshot dựa trên tổ hợp đã build cố định projection người dùng nhìn thấy có tính xác định, trình duyệt chịu trách nhiệm nghiệm thu đấu nối và lớp gánh. Kỷ luật giữa các lớp vẫn do review đảm nhiệm, còn Linux CI đảm bảo độ mới của output kỳ vọng trình duyệt thông qua gate máy. Mỗi snapshot ứng dụng mới đều phải tránh output layout hoặc đồng hồ không ổn định.

## Alternatives considered

| Phương án từ bỏ | Lý do ngắn gọn |
|---|---|
| e2e đơn nhất (toàn bộ đi qua trình duyệt) | Trình duyệt khởi động chậm gấp N lần ở tốc độ giây + trình tự không kiểm soát được; bất biến lớp wire/đối tượng có thể assertion toàn bộ ở mức mili giây trong node env |
| Chuyển verify script sang vitest | Script tuần tự dùng chung phiên trình duyệt, tách case thì phải hình thức hoá (sequential + dùng chung page) hoặc chạy lại tiền đề N lần; output dạng luồng PASS/FAIL chính là thứ agent (tác tử) dùng để định vị giao diện |
| Test tái sử dụng FixtureApiClient | Script demo chạy theo đồng hồ thật, test cần deferred kiểm soát trình tự thủ công — mục đích trực giao, tái sử dụng cứng sẽ trói test vào nhịp độ demo |
| Package GUI dùng vitest config độc lập (từng thiết kế vitest.gui.config.ts) | tests/ cấp package vốn đã được root include quét tới, lọc đường dẫn `vitest run packages/client packages/host` chính là vòng lặp hẹp — zero config mới |
| Tạm hoãn unit test cho lớp hook/component | jsdom vẫn là tuyến chính của coverage, vì nó có thể xác minh nhanh hành vi component theo từng file; gate replay trình duyệt bắt buộc ở lớp lắp ráp bổ sung cho nó, không thay thế nó ([quyết định gate CI](../testing/2026-07-30-web-browser-snapshot-ci-gate.md)) |
