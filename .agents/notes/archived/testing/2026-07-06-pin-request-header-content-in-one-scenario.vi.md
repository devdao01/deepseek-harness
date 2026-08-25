# Agent Note: Cố định nội dung request header trong một kịch bản snapshot duy nhất

Status: implemented
Archived: 2026-07-26

[English](2026-07-06-pin-request-header-content-in-one-scenario.md) | Tiếng Việt

## Vấn đề

Một bộ test snapshot ACP (Agent Client Protocol) cần chứng minh system prompt tổ hợp và danh sách tool schema thực sự được gửi trong mỗi `request/header`, nhưng nếu lặp lại nội dung đó trong từng `session.jsonl` thì chỉ một lần sửa prompt hoặc schema sẽ viết lại hàng chục bản ghi JSON một dòng khổng lồ. Giữ một bản header nguyên gốc thì tránh được trùng lặp, nhưng trải nghiệm review prompt vẫn rất tệ: câu chữ bị escape JSON dồn vào một dòng, trộn lẫn với tool schema dài hàng nghìn ký tự.

## Quyết định

Mỗi loại tổ hợp request header có đúng một kịch bản được đánh dấu `pinsHeader`. Thư mục của nó tách nội dung cố định theo định dạng thuận tiện cho review: `system-prompt.expected.md` chứa toàn bộ chuỗi prompt đã chuẩn hóa ở dạng Markdown thông thường; `tool-schemas.expected.json` chứa chuỗi schema đầy đủ tương ứng ở dạng JSON có cấu trúc; `session.jsonl` giữ lại config, reason và mọi phần tiền tố mà model nhìn thấy, đồng thời lưu `header.system` và `header.tools` thành `"{{system}}"` / `"{{tools}}"`. Mọi file JSONL khác đều dùng chung token prompt và tool đó, và cũng token hóa nội dung tiền tố phiên tương tự. Cơ chế cố định nằm ở [`dsh-acp-snapshot`](../../../../packages/support/acp-snapshot/README.md), với suite factory bắt buộc mỗi loại có đúng một kịch bản cố định.

Các normalizer thuần `scrubSystemPrompts` và `scrubToolSchemas` sẽ token hóa riêng từng request header đầy đủ đã lưu. `scrubRequestHeaders` còn token hóa nội dung tiền tố phiên cho các kịch bản không cố định, đồng thời giữ nguyên số lượng request header, sự tồn tại của các trường, config, reason và số lượng message tiền tố. Đường ghi lại khi record và refresh sẽ áp dụng bước làm sạch phù hợp trước khi ghi JSONL, rồi tái tạo hai file sidecar từ chuỗi request header đầy đủ chạy thật đã chuẩn hóa, nên cả hai đường đều không thể đưa các khối prompt/schema lớn trở lại JSONL, cũng không để lại sản phẩm review cũ kỹ.

Guard làm cho cách tách này tự cưỡng chế. Trên đĩa, mỗi `session*.jsonl` là điểm bất động của trình làm sạch prompt và schema; chỉ fixture (dữ liệu chuẩn bị cho test) không cố định mới bắt buộc là điểm bất động của trình làm sạch request header đầy đủ; hai sidecar nằm đúng cạnh fixture cố định và theo định dạng chuẩn tắc, kết thúc bằng ký tự xuống dòng; mỗi loại có một kịch bản cố định. Trong lần chạy thật, mọi `request/header` sinh ra từ tiến trình cha, tiến trình con spawn, tiến trình con fork, request khởi tạo, khôi phục hay thay đổi trong cùng một instance đều phải khớp với chuỗi theo loại được dựng lại sau khi các giá trị hay biến động được chuẩn hóa. Request header mà không có prompt dạng chuỗi, không có danh sách tool dạng mảng, hoặc vượt quá số lượng request header thay đổi mà kịch bản cố định khai báo, sẽ thất bại lớn tiếng.

Một kịch bản cố định bao phủ toàn bộ bộ test, bởi mỗi phiên (parent, phiên con spawn, phiên con fork) tổ hợp ra danh sách tool hoàn toàn giống nhau và prompt giống hệt nhau ngoại trừ cwd, còn guard nhất quán sẽ lập tức làm bộ test thất bại khi tiền đề này không còn đúng. Nếu về sau tổ hợp header được thiết kế để phụ thuộc theo phiên (ví dụ bộ tool bị hạn chế của subagent) thì hình thái phân kỳ đó sẽ có kịch bản cố định riêng.

## Các phương án từng cân nhắc

- **Ghi lại hoặc sửa tay toàn bộ fixture sau mỗi lần thay đổi**: giữ được header chính xác, nhưng khác biệt về hành vi bị nhấn chìm trong nội dung prompt và schema lặp lại.
- **Chỉ scrub khi so sánh, fixture giữ nguyên nội dung gốc**: so sánh thì qua, nhưng fixture đã commit vẫn giữ nội dung trùng lặp cũ kỹ và sẽ bị viết lại toàn bộ ở lần record kế tiếp. Lưu token là cách trung thực cho biết mỗi JSONL không cố định điều gì.
- **Scrub tất cả, không cố định gì cả**: mất đi bản ghi end-to-end duy nhất về nội dung thực sự được gửi trong header tổ hợp (cách lắp ráp prompt, thứ tự tool đã đăng ký, schema đầy đủ). Danh mục tool sinh tự động chỉ ghi lại từng tool một cách biệt lập; chỉ fixture thật mới cố định được tập hợp đầy đủ sau khi tổ hợp.
- **Giữ toàn bộ nội dung cố định ngay trong JSONL**: loại bỏ được trùng lặp ở phạm vi bộ test, nhưng thay đổi prompt và schema vẫn là một dòng văn bản đã escape. Markdown và JSON có cấu trúc mang lại cho mỗi loại nội dung định dạng review tự nhiên của nó, mà không làm suy yếu các khẳng định dựng lại header.
- **Thu hẹp chính session log (ghi digest nội dung, để request header ở nơi khác)** — vi phạm cam kết về khả năng dựng lại: log sản phẩm phải tái hiện từng request đến từng bit ([Agent Note về request dựng lại được (bản ghi quyết định của agent)](../architecture/2026-07-05-reconstructable-requests.md)). Kích thước request header là vấn đề của sản phẩm test, cần giải quyết ở khâu chuẩn hóa test; log chạy thật giữ nguyên.

## Kiểm chứng

Bộ test replay từng kịch bản dựa trên nội dung cố định đã tách. Coverage unit bao phủ các trình làm sạch riêng lẻ và đầy đủ, hai định dạng sidecar request header đầy đủ, việc tái tạo khi record/refresh, việc trích xuất prompt/schema đã chuẩn hóa, cưỡng chế điểm bất động, tính đối xứng của các file bắt buộc, tính nhất quán của request header dựng lại, cũng như việc từ chối khi số lượng request header thay đổi.

## Hệ quả

Thay đổi system prompt tạo ra một diff Markdown theo dòng trong mỗi loại tổ hợp bị ảnh hưởng; thay đổi mô tả tool tạo ra một diff JSON có cấu trúc trong mỗi loại; các fixture hành vi thông thường không bị ảnh hưởng. Fixture phiên hiển thị token cho phần nội dung bị lược bỏ, và guard nhất quán lúc chạy khiến mỗi kịch bản cố định đã tách có thẩm quyền với mọi phiên trong loại của nó. Mỗi kịch bản cố định mang theo hai file sidecar được sinh ra và chuẩn hóa xuống dòng.
