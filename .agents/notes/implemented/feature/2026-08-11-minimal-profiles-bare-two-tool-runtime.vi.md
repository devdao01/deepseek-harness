# Agent Note: minimal profile dùng runtime hai-tool trần

Status: implemented

[English](2026-08-11-minimal-profiles-bare-two-tool-runtime.md) | 中文

## Vấn đề

Web `minimal` preset và tổ hợp JSON-RPC minimal độc lập cùng phơi bày `bash` bền vững và `str_replace_editor` ra bên ngoài, nhưng service hỗ trợ không nhất quán với runtime huấn luyện mục tiêu. Cả hai đều gắn context compaction, trong khi Web preset kế thừa filesystem sandbox của host, còn tổ hợp JSON-RPC gắn `fs-sandbox` và filesystem policy. Do đó, phiên dài có thể thay thế lịch sử, và editor cũng công bố và thực thi một filesystem policy mà runtime tham chiếu local trần không hề có.

Bên sở hữu cấu hình của hai đường khởi động này cũng khác nhau. Web gắn preset theo từng agent lên một host đang chạy, còn Python SDK khởi tạo một subprocess JSON-RPC stdio hoàn chỉnh. Coi hai thứ này như cùng một Cordis leaf có thể hoán đổi cho nhau sẽ che giấu khác biệt về vòng đời, và ví dụ SDK cũng không có lối vào để chọn model hay system prompt qua environment.

## Quyết định

Cả hai minimal profile đi kèm chỉ phơi bày `bash` bền vững và `str_replace_editor` ra bên ngoài, không gắn nhà cung cấp context compaction, ngăn mỗi đóng góp runtime-context của `dsh-system-prompt` cho phiên mới, và cho editor dùng `@deepseek-ai/dsh-fs-local`. Web preset cô lập `ctx.fs` bên trong agent entry, gắn `fs-local` cùng editor, do đó các agent Web khác vẫn dùng nhà cung cấp filesystem của host. Persona của nó tiếp tục dùng prompt complete cố định thuộc sở hữu của [quyết định tổ hợp minimal preset trước đó](../bug-fix/2026-08-10-minimal-preset-owns-rl-composition.md), và chỉ áp dụng việc ngăn runtime-context trong phạm vi agent đó. Spine độc lập chuyển tiếp cùng thiết lập đó tới system-prompt service do chính process của nó sở hữu. Sandbox và approval service vẫn được gắn và thực thi policy của chúng; chỉ riêng phần context động hướng tới model của chúng là vắng mặt.

[`minimal.cordis.yml`](../../../../examples/jsonrpc-agent/minimal.cordis.yml) độc lập vẫn là tổ hợp process JSON-RPC hoàn chỉnh. Nó gắn `dsh-sdk-jsonrpc-server`, local PTY và subprocess service mà Bash bền vững cần, `fs-local`, hai tool consumer, và persistence JSONL không nén. Nó không gắn `token-meter`, `compaction-basic`, `fs-sandbox`, hay `fs-observation-policy`. Bash bền vững vẫn tiêu thụ policy sandbox danger-full-access mà bản triển khai gắn vào; editor không bị policy đó giới hạn.

`DSH_SYSTEM_PROMPT` chọn persona cho tổ hợp độc lập. `DSH_MODEL` đặt tên mục nhà cung cấp DeepSeek trong catalog, `DSH_CONTEXT_WINDOW` cung cấp dung lượng của mục đó. Vì SDK client sở hữu request `initialize` JSON-RPC, [`minimal.py`](../../../../examples/jsonrpc-agent/minimal.py) cũng dùng `DSH_MODEL` làm mặc định cho tham số `model`; `--model` tường minh vẫn có ưu tiên cao nhất. Biến endpoint và credential tiếp tục do đường giải quyết environment sẵn có của adapter DeepSeek nắm giữ.

## Xác minh

Bài replay Web khởi động một host Web hoàn chỉnh, tạo agent qua preset service, và khẳng định filesystem trong phạm vi là backend trần, không tồn tại compaction service trong phạm vi, không có message runtime-context thuộc sở hữu system-prompt nào được thêm vào, và request tổ hợp chỉ chứa prompt cố định cùng hai tool. Sau đó, nó thực thi Bash bền vững và editor qua service thực trong phạm vi.

Bài replay SDK khởi động một process agent JSON-RPC thực qua SDK client, tiêm prompt được chọn theo environment, khẳng định prompt tổ hợp và đúng catalog hai tool, đồng thời khẳng định không tồn tại message runtime-context thuộc sở hữu system-prompt nào, và thực thi hai tool. Runtime override tích hợp sẵn của Python SDK khởi tạo cấu hình độc lập qua từng phương thức đóng gói khả dụng, dùng giá trị model, dung lượng model và prompt được chọn theo environment. Việc kiểm tra Cordis xác minh cả hai cấu hình có thể giải quyết được các plugin và trường cấu hình đã khai báo.

## Phương án khác đã cân nhắc

**Giữ `compaction-basic` với ngưỡng cao hơn.** Không áp dụng, vì dù nhà cung cấp không kích hoạt trong test ngắn, phiên dài hơn vẫn cho phép thay thế lịch sử, và tổ hợp minimal vẫn sẽ phụ thuộc vào metadata dung lượng model và token meter.

**Giữ `fs-sandbox` ở chế độ danger-full-access.** Không áp dụng, vì nhà cung cấp sandbox vẫn khiến việc giới hạn và nâng quyền trở thành một phần năng lực của editor. Runtime mục tiêu yêu cầu nhà cung cấp local trần, và việc nó không có `sandboxMode` chính là thực tế của tổ hợp đó.

**Dùng chung một Cordis leaf cho khởi động Web và Python SDK.** Không áp dụng, vì Web preset đóng góp service phạm vi agent vào một host đa phiên hiện có, còn Python SDK phải khởi động toàn bộ process bao gồm cả JSON-RPC server và các dependency cấp process của nó.

**Chỉ đọc `DSH_MODEL` bên trong Cordis.** Không áp dụng, vì cấu hình Cordis cung cấp catalog nhà cung cấp, nhưng không sở hữu request `initialize` JSON-RPC của SDK client. Launcher phải truyền cùng model đó vào request của client, để giá trị environment có thể chọn được model định tuyến.

## Hệ quả

Phiên minimal không tóm tắt hay thay thế lịch sử cũ hơn, cũng không thêm snapshot runtime-context; bên gọi phải giữ số lượt trong phiên nằm trong dung lượng context của model đã chọn, và không được dựa vào mô tả sandbox hay approval policy thường trực hiển thị cho model. Editor có thể truy cập bất kỳ đường dẫn tuyệt đối nào mà process runtime nhìn thấy, và không bị ảnh hưởng bởi policy sandbox shell bền vững. Hai đường khởi động chia sẻ tool hướng tới model, đảm bảo không context và không compaction, đồng thời giữ prompt và cấu hình model khác nhau phù hợp với từng chủ sở hữu. Đường Python SDK tiếp tục chỉ giao tiếp qua runtime JSON-RPC stdio tích hợp sẵn.
