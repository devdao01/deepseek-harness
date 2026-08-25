# @deepseek-ai/dsh-compaction-tool-result-pruner

[English](README.md) | Tiếng Việt

Dịch vụ cắt tỉa (`ctx.toolResultPruner`) có thể phát lại an toàn, không phụ thuộc mô hình. Nó sẽ viết lại các node surface `tool/result` vượt ngân sách thành phần đầu bị giới hạn độ dài, một nhãn lược bỏ cố định và phần đuôi bị giới hạn độ dài, đồng thời giữ nguyên sự kiện gốc đầy đủ trong log phiên chỉ-thêm (append-only).

Đây là dịch vụ đi kèm cụ thể của [`dsh-compaction-basic`](../compaction-basic/README.md), không phải backend compaction (nén) hay công cụ hướng tới mô hình. Compact-basic đọc nó thông qua `ctx.get('toolResultPruner')` tùy chọn, do đó hai package này vẫn có thể được kết hợp độc lập với nhau.

## API dịch vụ

`pruneSession(session)` sẽ quét một snapshot ổn định của surface hiện tại. Mỗi kết quả công cụ vượt ngân sách sẽ được thay thế bằng một `tool/result` mới được thêm vào, mang theo `{ surfaceOp: { op: 'replace', start: originalSeq, end: originalSeq }, sourceEventSeqs: [originalSeq] }`. Việc thay thế sẽ trải rộng toàn bộ dữ liệu gốc, chỉ thay đổi `content`, giữ nguyên `turn`, `step`, `callId`, các trường lỗi, `meta` và các trường dữ liệu được thêm về sau. Sự kiện gốc vẫn có thể dùng cho bền vững hóa, phát lại và kiểm tra log chính xác.

Khi phiên từ chối việc thay thế, phương thức này sẽ ném ngoại lệ đồng bộ. Các thay thế đã commit trước đó trong lần quét này vẫn được giữ lại.

`measureContent(blocks)` sẽ đếm code point Unicode trong các block `text`. `pruneContent(blocks)` sẽ trả về bản thay thế bị giới hạn độ dài; nếu nội dung đã nằm trong ngưỡng, sẽ trả về `null`. Các block không phải văn bản giữ nguyên vị trí tương đối gốc; việc cắt lát văn bản sẽ không bao giờ chia tách một cặp surrogate UTF-16, nhưng có thể chia tách một cụm grapheme gồm nhiều code point.

Mỗi kết quả phát ra, tính theo code point văn bản, đều chứa chính xác ngân sách phần đầu đã cấu hình, nhãn cố định và ngân sách phần đuôi, không lớn hơn `thresholdChars`, và nhỏ hơn nghiêm ngặt so với đầu vào đã kích hoạt. Do đó lần quét thứ hai sẽ không phát ra thay thế nào nữa.

## Cấu hình

Khóa cấu hình không nhận diện được sẽ khiến plugin thất bại lúc khởi tạo. Cấu hình đã giải quyết tách biệt với đầu vào, và bất biến ở mọi cấp độ (deeply immutable).

| Khóa cấu hình | Bắt buộc | Ý nghĩa |
|---|---|---|
| `thresholdChars` | Không (mặc định `8192`) | Cắt tỉa khi văn bản đã gộp vượt quá số code point Unicode này. |
| `headChars` | Không (mặc định `4096`) | Số code point Unicode đầu được giữ lại. |
| `tailChars` | Không (mặc định `1024`) | Số code point Unicode cuối được giữ lại. |

Tất cả giá trị phải là số nguyên; ngưỡng phải dương, phần đầu/đuôi phải không âm. Tổng `headChars + marker + tailChars` không được vượt quá `thresholdChars`, do đó một cấu hình hợp lệ có thể cắt tỉa mọi kết quả vượt ngân sách mà không làm tăng kích thước hay viết lại lặp lại.

## Cách dùng

```ts
import type { Context } from '@deepseek-ai/cordis'
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'

export function apply(ctx: Context): void {
  ctx.plugin(ToolResultPruner)
}
```

## Trải nghiệm mô hình

### Kết quả công cụ đã cắt tỉa

#### Nội dung mô hình nhìn thấy

Một khi điều kiện kích hoạt compaction được đáp ứng, request tiếp theo sẽ thấy phần đầu được giữ lại, `\n\n[... tool result middle pruned ...]\n\n` và phần đuôi được giữ lại, thay vì phần văn bản đã bị loại bỏ. Các block không phải văn bản giữ nguyên thứ tự ban đầu. Mô hình sẽ không thấy bản sao thứ hai của văn bản gốc.

#### Ảnh hưởng Token

Mỗi kết quả công cụ đã viết lại chứa tối đa `thresholdChars` code point văn bản. Bản thân việc cắt tỉa không phát sinh lệnh gọi mô hình; khi request đo lại nằm dưới ngưỡng áp lực, compaction-basic sẽ bỏ qua tóm tắt, ngược lại bộ tóm tắt sẽ đọc surface đã được cắt tỉa.

#### Ảnh hưởng KV Cache

Thay thế kết quả cũ hơn sẽ làm mất hiệu lực tái sử dụng kể từ token đầu tiên bị thay đổi. Khi routing, envelope của nó nhất quán với lịch sử trước đó, tiền tố đã cắt tỉa vẫn có thể được tái sử dụng.

## Giới hạn đã biết & công việc hoãn lại

- **Ngân sách ký tự không phải ngân sách token**: mật độ token khác nhau tùy nhà cung cấp, do đó `ctx.tokenMeter` vẫn là bên quyết định xem việc cắt tỉa có làm giảm áp lực request hay không.
- **Cắt tỉa chỉ dựa trên cú pháp**: nó giữ lại phần đầu và phần cuối, không diễn giải xem dòng nào ở giữa quan trọng về mặt ngữ nghĩa.
- **Cụm grapheme có thể bị chia tách**: cắt lát theo code point bảo vệ cặp surrogate, nhưng không thực hiện phân tách cụm grapheme theo locale.
