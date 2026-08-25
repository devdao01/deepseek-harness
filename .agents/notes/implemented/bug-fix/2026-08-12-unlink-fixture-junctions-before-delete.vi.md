# Agent Note: Unlink junction của fixture trước khi xóa đệ quy

Status: implemented

[English](2026-08-12-unlink-fixture-junctions-before-delete.md) | Tiếng Việt

## Vấn đề

Fixture của install-lefthook và translation-pairing dùng junction để liên kết `scripts/`, `node_modules` và thư mục package tsx thật của repo vào cây fixture, để phép dò của installer có thể xuyên qua và giải quyết được. Việc xóa đệ quy trên Windows có thể coi junction (reparse point kiểu MOUNT_POINT) như một thư mục và đi theo vào đích của nó; `worktree remove` của Git chính là đã xóa mất `scripts/` và package tsx được theo dõi của repo theo đúng cách đó (bản ghi log của sự cố đã định vị việc xóa đúng tại bước này). Do đó, việc dọn dẹp fixture tin tưởng vào deleter lại xóa mất mã nguồn của chính repo, chứ không phải fixture.

## Quyết định

`scripts/test-fixture-cleanup.ts` sở hữu việc tháo dỡ fixture an toàn với junction: `unlinkFixtureLinks` duyệt và unlink mọi reparse point trước, `removeFixtureSafely` sau đó mới xóa cây đã hết liên kết (kèm thử lại cho handle bất đồng bộ trên Windows). Mọi hook `afterEach` bị ảnh hưởng và hook chạy trước `worktree remove` đều gọi nó. Quy tắc chung được ghi lại trong `docs/defensive-patterns.md`: đường dẫn dạng link thì xóa bằng unlink, `rmSync` đệ quy chỉ dành cho đường dẫn đã biết chắc là thư mục thật.

## Các phương án đã cân nhắc

**Chỉ tin vào việc xóa đệ quy.** Bị bác bỏ: việc một deleter cụ thể có theo dấu junction hay không tùy theo từng công cụ và phiên bản, còn chính đường `git worktree remove` này đã từng phá hủy file được theo dõi; không phép dọn dẹp nào nên đem repo ra đánh cược vào hành vi đó.

**Sao chép thay vì junction thư mục thật.** Bị bác bỏ: ý nghĩa của fixture chính là dùng nội dung thật để dò đúng đường của installer thật, bản sao chép sẽ làm mất đi ranh giới đang được kiểm thử.

## Hệ quả

Việc tháo dỡ fixture giờ không thể xuyên qua junction để chạm tới mã nguồn của repo nữa. Chi phí phát sinh chỉ là một lượt lstat/unlink cho cây fixture nhỏ. Khiếm khuyết phá hủy dữ liệu này giờ có một lý do được lưu bền cạnh quy tắc defensive-patterns, và helper này cũng là đường tháo dỡ dùng chung cho mọi fixture kiểu junction về sau.
