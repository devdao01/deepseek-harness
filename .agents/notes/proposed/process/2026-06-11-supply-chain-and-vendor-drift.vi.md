# Agent Note: Kiểm tra chuỗi cung ứng và xác thực trôi lệch vendor

Status: proposed

[English](2026-06-11-supply-chain-and-vendor-drift.md) | 中文

## Vấn đề

Vendor manifest (bản khai metadata) (xem [quyết định đưa vendor vào](../../implemented/process/2026-06-11-vendor-cordis-as-source.md)) lúc commit chỉ được thực thi bắt buộc theo *chiều thuận* (thay đổi vendor ⇒ cập nhật manifest), nhưng không có cơ chế nào xác thực *tuyên bố* của manifest: tức là vendor/ thực sự bằng nội dung của SHA do thượng nguồn chỉ định cộng với các sửa đổi đã được ghi lại. Ngoài ra, một số ít phụ thuộc NPM thật sự cũng không có giám sát công bố bảo mật hay nhịp độ cập nhật.

## Đề xuất

1. **Kiểm tra trôi lệch vendor** (CI ban đêm): clone nông repo thượng nguồn theo SHA đã ghi trong manifest, copy source code của gói tương ứng, diff với `vendor/*/src`. Trừ khi diff khớp với các sửa đổi cục bộ đã ghi lại (mỗi sửa đổi được lưu dưới dạng file patch commit vào repo — bản ghi log chuyển từ mô tả văn bản thành sản phẩm có thể xác minh), nếu không tác vụ sẽ thất bại.
2. **Công bố bảo mật phụ thuộc**: chạy osv-scanner (hoặc `pnpm audit`) trên lockfile, thực thi định kỳ theo lịch, và kích hoạt trên PR (Pull Request) có thay đổi lockfile.
3. **Danh mục giấy phép**: một script khẳng định mỗi gói vendor đều mang file LICENSE của nó, và field `license` trong package.json khớp với danh mục trong vendor/README.md (chúng ta trộn lẫn MIT của vendor với BSD-3 của riêng mình) — chạy như một bước CI.
4. **Renovate** (hoặc tác vụ agent (tác tử) theo lịch) đề xuất cập nhật phụ thuộc NPM dưới dạng PR nhỏ, các PR này đi qua toàn bộ bộ cổng; gói vendor không nằm trong danh sách này (việc cập nhật chúng theo quy trình đồng bộ manifest, lý tưởng là một workflow agent bán tự động: kéo thượng nguồn, áp lại patch, chạy cổng, mở PR với bảng manifest đã cập nhật).

## Kế hoạch

Mục 3 đơn giản nhất, làm trước. Mục 1 cần CI có thể truy cập mạng tới repo thượng nguồn (repo riêng tư, cần token), và chuyển hai sửa đổi đã ghi lại hiện có thành file patch. Mục 2 và mục 4 là công việc cấu hình.

## Các phương án thay thế đã cân nhắc

- **Dùng `pnpm audit` thay cho osv-scanner**: cả hai đều thỏa mãn nhu cầu quét công bố bảo mật; lựa chọn cụ thể để lại quyết định ở giai đoạn triển khai.
- **Dùng tác vụ agent theo lịch thay cho Renovate**: hiệu quả tương đương trong việc đề xuất PR cập nhật nhỏ và đi qua toàn bộ bộ cổng; gói vendor dù theo phương án nào cũng không nằm trong danh sách này (việc cập nhật chúng theo quy trình đồng bộ manifest).

## Tiêu chí nghiệm thu

- Script danh mục giấy phép chạy trong CI, thất bại khi thiếu LICENSE hoặc field `license` mâu thuẫn với danh mục trong `vendor/README.md`.
- Tác vụ trôi lệch ban đêm dựng lại `vendor/` từ SHA trong manifest cộng file patch đã commit, thất bại khi xuất hiện bất kỳ diff nào không thể giải thích.
- Quét công bố bảo mật chạy định kỳ theo lịch, và chạy trên PR có thay đổi lockfile.

## Rủi ro

Repo thượng nguồn là bản mirror riêng tư; credential và khả năng sẵn sàng của CI là trở ngại chính đối với việc kiểm tra trôi lệch. Nếu bị chặn, có thể chuyển sang tác vụ agent theo lịch chạy cục bộ thay vì CI.
