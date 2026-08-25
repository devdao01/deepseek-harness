# Agent Note: Gỡ các trường chỉ-ghi và một núm xoay định tuyến vô hiệu khỏi fs seam

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-prune-write-only-fs-surface.md) | Tiếng Việt

## Vấn đề

[Việc tách fs seam](2026-06-26-fsspec-style-fs-seam.md) đã chuyển việc định tuyến đọc và chính sách từ backend sang `dsh-tool-fs` và `dsh-fs-policy`. Có bốn chỗ trên bề mặt còn giữ nguyên hình dạng trước khi tách — được điền vào ở mỗi lời gọi, nhưng không ai đọc:

1. **`STREAM_MIN_SIZE` + `FsIoInternals.streamMinSize` trong `dsh-fs-local`** — *đã bị gỡ trước thay đổi này bởi cuộc rà soát «cấm hardcode tham số điều chỉnh», cuộc rà soát đó chuyển ngưỡng định tuyến sang cấu hình `readStreamMinSize` của `dsh-tool-fs`; ghi lại ở đây để trình bày trọn vẹn toàn bộ đợt dọn dẹp.* Vị trí gốc (`packages/fs/fs-local/src/fsio.ts`, tái xuất từ `packages/fs/fs-local/src/index.ts`): không có bên đọc nào trong toàn kho mã, kể cả mã nguồn và kiểm thử của chính fs-local. Backend không hề định tuyến đọc — `readWholeText`/`streamWholeText` là hai nguyên thủy độc lập để bên gọi tự chọn — còn hằng số định tuyến thật nằm ở phía consumer (`packages/fs/tool-fs/src/read.ts`, so sánh với `info.size`). Hai bản sao của cùng một dữ kiện 10 MiB; bản ở backend là mã chết, và JSDoc của núm xoay đó còn khẳng định nó cung cấp một tùy chọn ghi đè «read routing» thực ra không tồn tại.
2. **`FsTarget.inputPath`** (`packages/fs/fs/src/types.ts`): mọi backend và mọi mock kiểm thử đều phải bịa ra một giá trị cho trường «chỉ dùng để chẩn đoán» này, trong khi trong môi trường production không ai đọc — plugin chính sách và mọi thông điệp lỗi đều dùng `targetKey`/`displayPath`. Bên sản xuất của `listDir` phơi bày sự dao động về ngữ nghĩa: các mục con trong thư mục nhận được tên mục trần, vốn chẳng phải «input» của ai cả.
3. **`FsEditOutcome.replacements` + `.replaceAll`** (`packages/fs/fs/src/types.ts`): `replacements` không có bên đọc nào trong production (bản thân chính sách khớp đơn vẫn được giữ — nó được cưỡng chế bởi việc backend ném `FS_AMBIGUOUS_EDIT`/`FS_EDIT_NOT_FOUND` trong nội bộ, và thông điệp lỗi vẫn giữ bộ đếm nội bộ); `replaceAll` chỉ được `formatEditOutput` trong `packages/fs/tool-fs/src/edit.ts` đọc — như một tiếng vọng của tham số `replace_all` mà bản thân công cụ vốn đã nắm giữ. Sau khi tinh giản, `FsEditOutcome` trở thành `{ version, before, after }`, khớp với các trường thực sự do backend phát hiện trong `FsWriteOutcome`.
4. **`FileReadOutcome.limit` + `.version`** (`packages/fs/tool-fs/src/read-render.ts`): được công cụ đọc điền vào, nhưng `formatReadOutput` chỉ dựng `offset`/`lines`/`totalLines`/`truncatedByBytes`, và lệnh phát sự kiện `fs/observed` dùng trực tiếp `info.version` chứ không dùng bản sao trong outcome.

## Quyết định

Xóa hằng số fs-local, phần tái xuất của nó và mục cấu hình `streamMinSize` (các mục `FsIoInternals` còn lại thì đúng là được kiểm thử ghi nguyên tử sử dụng); xóa `inputPath` khỏi `FsTarget`; thu hẹp `FsEditOutcome` thành `{ version, before, after }`, và truyền `replaceAll` từ tham số đã phân giải sang `formatEditOutput`; xóa `limit`/`version` khỏi `FileReadOutcome`. Đoạn dán trong [filesystem.md](../../../../docs/core-data-structures/filesystem.md), `packages/fs/fs/README.md`, cùng các fake kiểm thử vốn phải bịa ra những trường đã xóa, đều thu hẹp theo kiểu dữ liệu.

## Các phương án từng cân nhắc

### Vì sao không giữ lại?

Một tầng quyền hạn/cách ly trong tương lai có thể cần đường dẫn trước khi phân giải để sinh văn bản lỗi — nhưng thứ nó cần là *request*, mà mọi điểm gọi đều vẫn đang nắm giữ request. «Đã thay thế N chỗ» có thể trở thành văn bản hướng tới mô hình — đây là một thay đổi hành vi, cần thì hãy thiết kế, và bộ đếm nội bộ của backend vẫn được giữ cho thông điệp lỗi của nó. Chân trang phần đọc có thể hiển thị `limit` — nhưng mọi thứ chân trang hiển thị vốn đã suy ra được từ `lines`/`totalLines`. Trong khi đó, mọi backend hiện tại và tương lai (từ xa, native) đều phải bịa ra các trường giao thức mà không ai tiêu thụ, và mọi mock kiểm thử đều phải thỏa mãn chúng.

## Kiểm chứng

Các bề mặt đã xóa không còn tồn tại — `STREAM_MIN_SIZE`/`streamMinSize` trong `dsh-fs-local`, `FsTarget.inputPath`, `FsEditOutcome.replacements`/`.replaceAll`, cùng `FileReadOutcome.limit`/`.version` — trong khi `replaceAll` phía request (`FsEditRequest`) và các trường version trên những kiểu outcome khác vẫn giữ nguyên; các fake kiểm thử thu hẹp theo kiểu dữ liệu. Văn bản mà `formatEditOutput` sinh ra ở cả hai nhánh `replace_all` đều không thay đổi, nên không có kỳ vọng snapshot nào bị sửa.

## Hệ quả

Backend không gánh thêm nghĩa vụ mới, mà ngược lại trút bỏ được bốn trường không ai tiêu thụ. Tính năng khám phá fs (công cụ glob/grep) đụng tới cùng tệp kiểu `dsh-fs` — đây là chồng lấn ở mức văn bản chứ không phải mức thiết kế, có thể hợp nhất một cách máy móc.
