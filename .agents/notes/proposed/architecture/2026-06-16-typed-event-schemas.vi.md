# Agent Note: Schema runtime cho từ vựng sự kiện (cuộc tranh luận giữa Zod và mẫu merge-extensible-map)

Status: proposed

[English](2026-06-16-typed-event-schemas.md) | Tiếng Việt

## Vấn đề

harness mô hình hóa từ vựng cốt lõi của nó — khối nội dung, nguồn message, lý do kết thúc, trigger của lượt, lý do kết thúc lượt và sự kiện session — dưới dạng **merge-extensible map**: một `interface` TypeScript (như `SessionEventMap`, `ContentBlockMap`) mà plugin mở rộng bằng declaration merging, còn kiểu union công khai thì được suy ra qua `Map[keyof Map]`. Đây là mẫu mở rộng dùng chung của repo này, được ghi trong [docs/architecture.md](../../../../docs/architecture.md) («The same merge-extensible-map pattern is used for `MessageSource`, `FinishReason`, `TurnTrigger`, and `TurnEndReason`»), và cả DSL `InferArgs` của `defineTool` lẫn quy ước vét cạn `assertNever` đều dựa vào nó.

Mẫu này **chỉ tồn tại ở thời điểm biên dịch**. Kiểu biến mất lúc runtime: không có đối tượng schema nào để kiểm tra giá trị đầu vào, phân tích đầu vào không tin cậy, hay liệt kê các biến thể lúc runtime. [Quy ước lưu bền session](../../implemented/architecture/2026-06-14-session-persistence.md) làm lộ ra hai hệ quả:

1. **Lớp lưu bền coi `event.data` là JSON mờ.** Backend JSONL/SQLite thực thi `JSON.stringify`/`JSON.parse` nguyên trạng cho mọi sự kiện; guard runtime duy nhất là `isJsonValue` (kiểm tra khả năng serialize khứ hồi: từ chối BigInt, hàm, tham chiếu vòng, số không hữu hạn, v.v.), chứ không phải kiểm tra cấu trúc. Một dữ liệu sự kiện bị hỏng nhưng vẫn là JSON hợp lệ (sai kiểu trường, thiếu trường) sẽ đi khứ hồi trong im lặng, và chỉ có thể bị bắt về sau tại `switch` của bên tiêu thụ.
2. **Việc plugin thêm biến thể mới không có quy ước runtime nào.** Một plugin thêm khóa `SessionEventMap` mới bằng declaration merging thì có kiểu ở thời điểm biên dịch trong code của chính nó, nhưng không có cơ chế nào kiểm tra xem giá trị mà nó tạo ra có khớp hình dạng nó đã khai báo hay không — dù ở phía nhà sản xuất, ở biên lưu bền hay lúc nạp lại.

Từ đó dẫn tới câu hỏi: từ vựng sự kiện có nên chuyển sang **Zod** hay một thư viện schema runtime khác, để biên lưu bền và biên plugin có schema runtime thay vì kiểu bị xóa bỏ hay không.

## Vì sao đây không phải là một thay đổi ở tầng lưu bền

Rất dễ hiểu «dùng Zod để serialize» thành một sửa đổi cục bộ ở `dsh-session-persistence-jsonl/src/format.ts`. Nhưng không phải vậy, vì một sự thật mang tính cấu trúc: **plugin không thể declaration merge lên schema Zod.** Declaration merging là cơ chế ở thời điểm biên dịch của TypeScript; schema Zod là giá trị runtime. Muốn dùng Zod để kiểm tra sự kiện thì cần một **registry runtime** mà mỗi package sinh ra sự kiện phải đóng góp schema của chính nó vào (như `ctx.sessionEvents.register('compaction/marker', z.object({…}))`), và mỗi bên tiêu thụ đọc ra từ đó. Registry này — chứ không phải backend lưu bền — sẽ trở thành nguồn sự thật của từ vựng, thay thế interface merge-extensible.

Vì vậy, đề xuất thực sự là: **thay mẫu merge-extensible-map ở thời điểm biên dịch bằng một registry schema runtime, trên phạm vi toàn repo.** Đây là một lần thiết kế lại từ vựng cốt lõi.

## Phạm vi ảnh hưởng (đã đo)

Chuyển các interface sự kiện/từ vựng sang schema runtime, ít nhất sẽ liên quan tới:

- **Sáu merge-extensible map** (khoảng 370 dòng kiểu cốt lõi): `ContentBlockMap`, `MessageSourceMap`, `FinishReasonMap` (nằm ở `dsh-llm`); `TurnTriggerMap`, `TurnEndReasonMap`, `SessionEventMap` (nằm ở `dsh-session`).
- **Khoảng 10 vị trí bổ sung khai báo `declare module`**, phân bố ở các package `dsh-agent`, `dsh-agent-loop`, `dsh-shell`, `dsh-llm`, `dsh-session`, `dsh-session-persistence`, `dsh-system-prompt`, `dsh-tools` — mỗi vị trí đều sẽ chuyển từ declaration merging sang lời gọi `register()` lúc runtime.
- **Bên sản xuất sự kiện** — 16 lời gọi `session.append(...)` trong agent loop (vòng lặp agent) — giữ nguyên hình dạng, nhưng nay được kiểm tra tại biên.
- **Khoảng 7 bên tiêu thụ dạng switch** phân nhánh trên các kiểu union này: `deriveMessages` và invariant companion do chính package sở hữu (`dsh-session`), `BlockAssembler` (`dsh-llm`), hai adapter LLM (mô hình ngôn ngữ lớn) (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) cùng tầng tool schema (`dsh-tools`). Quy ước `assertNever` vét cạn cho union đóng đối lại fall-through cho union mở rộng được (một quy tắc lint đã ghi lại) sẽ cần được cân nhắc lại — biến thể runtime không thể vét cạn ở mức tĩnh.
- **DSL `InferArgs` của `defineTool`** (`dsh-tools`), suy ra kiểu tham số `execute` không cần ép kiểu từ đặc tả schema ở thời điểm biên dịch — đây là ca sử dụng tiêu biểu của phương án hiện tại.
- **Tài liệu**: architecture.md (mẫu này được mô tả là nền tảng), [invariant của mẫu phát triển](../../implemented/architecture/2026-06-11-dev-invariants-over-deep-readonly.md), và mọi Agent Note tham chiếu tới mẫu đó.

Đây là một lần thiết kế lại từ vựng ở cấp repo, chứ không phải chi tiết hiện thực của lớp lưu bền.

## Các phương án đã cân nhắc

### A. Giữ nguyên hiện trạng — kiểu merge-extensible + `isJsonValue` tại biên lưu bền
Giữ mẫu ở thời điểm biên dịch. Lớp lưu bền tiếp tục dùng JSON mờ + guard khả năng serialize. Plugin mở rộng bằng declaration merging; tính đúng đắn của *hình dạng* sự kiện do bên sản xuất chịu trách nhiệm và được TypeScript bảo đảm ở thời điểm biên dịch. Khi bật invariant companion do package sở hữu, chúng sẽ kiểm tra một số quan hệ liên bản ghi được chọn, nhưng không cung cấp schema hình dạng runtime tổng quát.

- **Ưu điểm**: không thay đổi gì; mở rộng plugin chỉ cần một dòng bổ sung `interface`, được suy kiểu đầy đủ, không cần nghi thức đăng ký lúc runtime; không thêm phụ thuộc runtime; DSL `defineTool` và vét cạn `assertNever` tiếp tục hoạt động.
- **Nhược điểm**: không có kiểm tra cấu trúc lúc runtime tại biên lưu bền và biên plugin; dữ liệu sai định dạng nhưng vẫn là JSON hợp lệ bị bắt muộn.

### B. Chỉ kiểm tra các hình dạng header/đóng (schemastery), sự kiện vẫn mờ
Chỉ siết chặt những hình dạng thực sự đóng vốn đã có type guard viết tay — ví dụ guard `HeaderLine` của JSONL (`isHeaderLine`) — bằng **schemastery** (thư viện schema sẵn có của repo, đã dùng cho `static Config` của mỗi plugin). Union sự kiện merge-extensible giữ nguyên.

- **Ưu điểm**: thay đổi nhỏ, hợp với quy ước hiện có (schemastery, không phải thư viện mới); thay guard viết tay trên hình dạng đóng bằng schema khai báo; không thiết kế lại phần cốt lõi.
- **Nhược điểm**: không giải quyết vấn đề kiểm tra dữ liệu sự kiện; chỉ các bản ghi metadata cố định được cải thiện.

### C. Lập registry schema runtime cho toàn bộ từ vựng (Zod hoặc schemastery)
Thay merge-extensible map bằng registry runtime, bên sản xuất đóng góp schema vào đó, còn đường lưu bền/tiêu thụ thì kiểm tra dựa trên nó.

- **Ưu điểm**: có kiểm tra runtime thực sự tại biên lưu bền và biên plugin; nguồn sự thật duy nhất; có thể chống đỡ cho công cụ tổng quát (tự sinh tài liệu, fuzz test, kiểm tra định dạng giao thức (wire format)).
- **Nhược điểm**: toàn bộ phạm vi ảnh hưởng nêu trên; **Zod hiện không phải phụ thuộc trực tiếp** (chỉ là phụ thuộc bắc cầu của `@earendil-works/pi-ai`), còn thư viện schema mà repo đã chọn là **schemastery** — đưa Zod vào diện rộng tự nó đã là một quyết định về phụ thuộc; sự tiện dụng của declaration merging (mở rộng plugin một dòng, suy kiểu đầy đủ) bị thay bằng đăng ký lúc runtime + đấu nối kiểu thủ công; bảo đảm vét cạn của `assertNever` bị suy yếu (biến thể runtime không thể vét cạn ở mức tĩnh).

## Đề xuất

Hoãn lại. Nếu cần kiểm tra runtime tại biên lưu bền, **phương án B** (dùng schemastery cho các hình dạng header và metadata đóng) là bước đi vừa phải trong khuôn khổ quy ước hiện có. **Phương án C** là một quyết định kiến trúc, cần Agent Note hiện thực riêng của nó, trong đó bao gồm lựa chọn giữa Zod và schemastery.

## Tiêu chí chấp nhận

- Phương án C chỉ được tiến hành qua Agent Note hiện thực riêng của nó, tuyệt đối không được làm như một thay đổi kèm theo của lớp lưu bền.
- Nếu áp dụng phương án B, các hình dạng header/metadata đóng (guard `isHeaderLine` của JSONL và tương tự) chuyển sang kiểm tra bằng schemastery thay cho guard viết tay, còn merge-extensible map thì giữ nguyên.

## Rủi ro

- Hoãn lại đồng nghĩa với việc `data` của sự kiện vẫn không được kiểm tra cấu trúc tại biên lưu bền: dữ liệu sai định dạng nhưng vẫn là JSON hợp lệ bị bắt muộn, do `switch` của bên tiêu thụ đỡ — đây là cái giá của hiện trạng, được chấp nhận một cách có chủ ý.
- Nếu phương án C cuối cùng được chọn, phần mất mát về tiện dụng là có thật: một dòng declaration merging trở thành đăng ký runtime cộng đấu nối kiểu thủ công, và bảo đảm vét cạn tĩnh của `assertNever` bị suy yếu.

## Câu hỏi còn bỏ ngỏ

- Nếu dùng registry thì chọn thư viện **schemastery** (đã có trong repo, đã là thư viện schema cho config) hay **Zod** (hệ sinh thái phong phú hơn, hiện chỉ là phụ thuộc bắc cầu)? Duy trì song song hai thư viện schema tự nó đã là một cái giá.
- Có thể dùng phương án lai hay không: giữ suy kiểu ở thời điểm biên dịch (để `defineTool` và trải nghiệm phát triển plugin không bị ảnh hưởng), đồng thời thêm schema runtime *tùy chọn* cho mỗi biến thể, chỉ kiểm tra tại biên lưu bền/giao thức chứ không kiểm tra ở mỗi lần append trong tiến trình?
- Sau khi bật dịch vụ `ctx.invariants`, liệu nó đã lấp đủ khoảng trống về hình dạng runtime để việc kiểm tra tại biên chỉ còn cần thiết khi đối mặt với đầu vào thực sự không tin cậy (nạp lại log đã bị sửa từ bên ngoài) hay chưa?
