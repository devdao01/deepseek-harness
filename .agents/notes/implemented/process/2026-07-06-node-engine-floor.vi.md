# Agent Note: Nâng sàn engine Node LTS lên 22.19

Status: implemented

[English](2026-07-06-node-engine-floor.md) | 中文

## Vấn đề

Nhánh Node 22 trong khoảng `engines.node` cấp root là quy ước cho workspace sau khi cài đặt, chứ không chỉ là quy ước cho các API runtime mà mã nguồn harness gọi trực tiếp. Nó không được thấp hơn `engines.node` mà các gói phụ thuộc đã cài đặt trong workspace khai báo trên nhánh đó; nếu không, `pnpm install --engine-strict` sẽ thất bại trên một phiên bản LTS đã công bố, còn kết quả cài đặt không ở chế độ strict sẽ chạy ngoài phạm vi runtime mà phụ thuộc hỗ trợ.

## Quyết định

Đặt `engines.node` thành `^22.19.0 || >=24.0.0`, và chạy CI không cần key trên `['22.19', 24, 26]`. Tác vụ Node 24 chính chịu trách nhiệm cho toàn bộ type check và tác vụ coverage unit test. Cả ba phiên bản đều chạy smoke test chuyên biệt cho source-worker, Zstandard, source-launch và [jsdom storage](../testing/2026-07-30-vitest-jsdom-webstorage-ownership.md), không lặp lại bộ type check và coverage đó. Workflow e2e với API thật vẫn ở Node 24, vì nó xác thực tích hợp API chứ không phải sàn runtime.

Hai tính năng Node quyết định ngưỡng runtime của mã nguồn:

- **`node:sqlite`**: `packages/session/session-persistence-sqlite` thực hiện `import { DatabaseSync } from 'node:sqlite'` ở cấp cao nhất. Module này bỏ yêu cầu cờ `--experimental-sqlite` kể từ **22.13** (LTS) và **23.4** (Current); trước đó, import nó sẽ ném lỗi khi nạp.
- **Native TypeScript type stripping** — smoke test chế độ build `examples/headless-agent/tests/keyless-smoke.e2e.ts` dùng `node` thuần (không tsx) để khởi động driver `.ts` không export của ví dụ đó, và nạp adapter test `.ts` của ví dụ (`cli-mock-llm.ts`). Type stripping trở thành hành vi mặc định kể từ **22.18** (LTS) và **23.6** (Current); phiên bản sớm hơn cần `--experimental-strip-types`.

Các tính năng mã nguồn này đều sẵn sàng trên nhánh 22.x tại **22.18**, nhưng phụ thuộc adapter Pi đã cài đặt lại nâng sàn LTS công bố lên cao hơn nữa. `@deepseek-ai/dsh-llm-pi-ai` phụ thuộc `@earendil-works/pi-ai@0.79.3`, package đó khai báo `engines.node >=22.19.0`, do đó sàn LTS là **22.19**. Nhánh 24.x giữ `>=24.0.0`. Khoảng không giao nhau này loại trừ hoàn toàn Node 23: Node 23.0–23.5 vẫn cần cờ cho ít nhất một tính năng mã nguồn, và nhánh 23 là non-LTS/đã EOL, công bố `>=23.6` sẽ thêm một dòng phát hành đã kết thúc và một nhánh CI mà không triển khai nào nên dùng.

`@types/node` tiếp tục cố định trên nhánh 22.x (`^22.20.0`), khớp với dòng hỗ trợ LTS: dùng API của Node 23+/24+/25+ sẽ khiến `tsc` thất bại trên mọi máy và gate type check, thay vì biên dịch qua trước rồi mới lộ lỗi khi nhánh ma trận sàn chạy. Hiện toàn bộ cây mã nguồn đều type check qua với API kiểu Node 22, do đó việc cố định phiên bản này không tốn chi phí gì.

## Hệ quả

- Nhánh LTS công bố không còn thấp hơn sàn của phụ thuộc adapter Pi.
- CI xác thực trực tiếp sàn Node 22 LTS qua Node 22.19, giữ tác vụ coverage chính ở `node: 24`, và dùng Node 26 xác thực dòng chẵn tiếp theo; cả ba phiên bản đều chạy smoke test tương thích tập trung.
- Smoke test chế độ build không cần cờ điều kiện theo phiên bản: type stripping đã là mặc định trên 22.19, do đó driver TypeScript riêng của ví dụ giữ nguyên đường `node fixture.ts` thuần.
- Nếu tương lai phụ thuộc hoặc API mã nguồn nâng sàn runtime, phải đồng bộ điều chỉnh `engines.node`, ma trận tương thích và Agent Note này trong cùng một thay đổi.

## Phương án thay thế đã từng cân nhắc

- **Giữ `^22.18.0 || >=24.0.0`.** Bác bỏ: nó công bố phiên bản LTS thấp hơn sàn của phụ thuộc adapter Pi. `@earendil-works/pi-ai@0.79.3` yêu cầu `>=22.19.0`.
- **Hạ cấp hoặc cố định `@earendil-works/pi-ai` để giữ khoảng công bố 22.18.** Bác bỏ: phụ thuộc adapter Pi hiện tại là một phần của workspace kỳ vọng, và 22.19 vẫn nằm trong nhánh Node 22 LTS.
- **Sàn `>=22.13` (ranh giới `node:sqlite`) cộng dùng `--experimental-strip-types` trong smoke test built-bin ở 22.13–22.17.** Bác bỏ: nó thêm cờ test điều kiện theo phiên bản cho một khoảng hẹp, và bọc phụ thuộc cờ thử nghiệm thành hỗ trợ chính thức. Phụ thuộc adapter Pi đã yêu cầu sàn LTS cao hơn.
- **Dùng `>=22.19` không giới hạn trên.** Bác bỏ: nó công bố hỗ trợ Node 23.0–23.5, trong khi ở các phiên bản này `node:sqlite` (đến 23.4) hoặc type stripping (đến 23.6) vẫn cần cờ.
- **Bao gồm Node 23.6+ (`^22.19.0 || >=23.6.0`).** Bác bỏ: 23.6+ đúng là chạy được cả hai tính năng mã nguồn mà không cần cờ, nhưng Node 23 đã kết thúc vòng đời (EOL); công bố hỗ trợ một dòng phát hành đã kết thúc sẽ thêm một mục khoảng và một nhánh CI mà không triển khai nào nên dùng runtime đó.
- **Ma trận `[22, 24, 26]` thay vì cố định `22.19`.** Bác bỏ: mục major version thả nổi sẽ trôi dần theo thời gian, âm thầm không còn xác thực sàn LTS đã khai báo.
- **Giữ `@types/node` vượt trước sàn runtime (`^25`).** Bác bỏ: định nghĩa kiểu vượt trước sàn runtime sẽ khiến API chỉ có ở Node 24/25 biên dịch qua, và chỉ thất bại khi chạy trên 22.x. Cố định `@types/node` trên nhánh 22.x biến loại lỗi này thành lỗi biên dịch trên mọi môi trường.
