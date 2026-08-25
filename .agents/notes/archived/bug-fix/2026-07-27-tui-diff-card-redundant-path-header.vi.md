# Agent Note: TUI diff card in lặp lại đường dẫn file

Status: implemented
Archived: 2026-07-31

[English](2026-07-27-tui-diff-card-redundant-path-header.md) | 中文

## Problem

Tool card `edit` và `write` in đường dẫn đích tới hai lần. `presentCall`/`presentResult` của cả hai đều trả về diff card có tiêu đề `Edit <path>`/`Write <path>`, trong khi `FileDiff` duy nhất của chúng lại mang cùng một `path`. `diffLines` của TUI vô điều kiện render `palette.bold(diff.path)` làm header cho mỗi file, vì vậy khi chỉnh sửa một file duy nhất, kết quả render sẽ là:

```
✓ Edit src/foo.ts
src/foo.ts
- old
+ new
```

Fixture (dữ liệu thử nghiệm) snapshot hiện có đã che giấu vấn đề này: nó đặt tiêu đề card sửa đổi là `Edit renderer` (không chứa đường dẫn), và cho kết quả chứa hai diff, do đó tiêu đề chưa bao giờ khớp với một đường dẫn diff cụ thể nào, khiến header không có vẻ dư thừa.

## Decision

`diffLines` bổ sung tham số `showPath`; khi một diff card chỉ có một diff duy nhất, và tiêu đề hiệu lực (`resultView?.title ?? callView.title`) đã chứa sẵn đường dẫn của diff đó, `ToolCardComponent.renderBody` sẽ ẩn header từng file đi. Diff card nhiều file vẫn giữ nguyên toàn bộ header từng file. Đường dẫn rỗng hoặc trắng cũng rơi vào phép kiểm tra `String.includes` này, đây chính là phần nhiễu được cố ý loại bỏ.

Logic ẩn này được đặt ở tầng render TUI, chứ không phải trong phương thức present của từng công cụ, vì sự dư thừa này là vấn đề hiển thị chung cho mọi diff card một file hiện tại và trong tương lai; công cụ vẫn cung cấp đường dẫn cả trong tiêu đề lẫn trong diff, nhờ đó các bên tiêu thụ ngoài TUI vẫn nhận được đầy đủ thông tin này.

## Alternatives considered

- Bỏ đường dẫn khỏi tiêu đề card `edit`/`write`. Đã bác bỏ: tiêu đề là dòng tóm tắt để đọc lướt nhanh, bỏ đường dẫn sẽ làm suy yếu nó, và còn phải lặp lại việc xử lý này ở từng công cụ.
- Loại bỏ header từng file một cách toàn diện. Đã bác bỏ: diff card kết quả nhiều file (và bất kỳ diff card nhiều file nào trong tương lai) thực sự cần header từng file.

## Consequences

Heuristic này thực hiện khớp chuỗi con (substring match), vì vậy nếu tiêu đề tình cờ chứa đường dẫn của một diff duy nhất, dù chỉ là trùng hợp ngẫu nhiên, header vẫn sẽ bị ẩn; đối với các bên sản sinh thực tế thì tiêu đề đúng là `Verb <path>`, nên trong thực tế điều này là chính xác. Fixture snapshot `edit` giờ khớp với sản phẩm thực tế: một diff duy nhất, đường dẫn của nó chính là đường dẫn được nêu trong tiêu đề, từ đó chứng minh header đã bị loại bỏ; còn header nhiều file được bao phủ bởi fixture `edit` trong `tui.spec.ts` (`a.txt`/`b.txt` dưới tiêu đề `Edit files`).

## Testing

`tui.spec.ts` đã thêm một case trọng tâm, khẳng định (assert) rằng với card một diff có tiêu đề `Edit src/only.ts`, đường dẫn chỉ xuất hiện đúng một lần. Snapshot `advanced-cards-*` không cần khóa (keyless) đã được ghi lại lần nữa, thể hiện dòng tiêu đề tiếp ngay sau phần thân diff, không còn header đường dẫn trùng lặp.
