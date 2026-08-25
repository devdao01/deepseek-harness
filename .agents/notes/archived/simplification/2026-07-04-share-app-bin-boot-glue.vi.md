# Agent Note: Dùng chung mã keo khởi động của bin ứng dụng, thay vì duy trì hai bản sao

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-share-app-bin-boot-glue.md) | Tiếng Việt

## Vấn đề

Hai bin stdio và ACP (Agent Client Protocol) mỗi bên đều lặp lại phần nạp môi trường, xử lý fail-loud, kiểm tra entry và logic khởi động, bao gồm cả hành vi tinh tế khi Loader thất bại. Hai bản sao đã trôi lệch khỏi nhau, lại nằm trong các tệp tự thực thi bị loại khỏi độ bao phủ kiểm thử đơn vị, khiến các hàm trợ giúp mà chúng export không thể tái sử dụng được.

## Quyết định

Các hàm trợ giúp chỉ tồn tại ở một nơi: [`@deepseek-ai/dsh-app-boot`](../../../../packages/ui/app-boot) (`packages/ui/app-boot`, xếp vào nhóm `ui`, vì bin là sản phẩm đã phát hành, nên phụ thuộc lúc chạy của nó bản thân cũng phải là package đã phát hành, chứ không phải `support/`). Bao gồm: `resolveConfigPath` (nhận biết snapshot, là bộ phân giải đường dẫn duy nhất dùng chung cho cả hai bin), `loadEnv`, `installFailLoud`, `assertEntriesLoaded` và `boot`, mỗi hàm đều được tham số hóa bằng tiền tố chẩn đoán của bin, và hỗ trợ tiêm phụ thuộc tại các seam tác dụng phụ của mình (warn sink, process slice), giúp bộ kiểm thử đơn vị bao phủ được từng nhánh — kể cả kịch bản `boot()` điều khiển Loader thật trong tiến trình với cấu hình dùng specifier đường dẫn tương đối, bao phủ cả đường đi bình thường trên cây đã ổn định lẫn đường từ chối khi không có entry fiber. Package này bật cổng kiểm độ bao phủ 100% theo từng tệp; tri thức liên quan tới việc Loader thất bại chỉ có một nơi thuộc về.

Mỗi `bin.ts` là một tổ hợp tự thực thi tinh gọn, gồm các hàm trợ giúp dùng chung cộng thêm vòng đời đặc thù của ứng dụng (bin ACP: bỏ qua biến môi trường ở chế độ phát lại và giải phóng khi stdin EOF; bin stdio: không có logic thêm). Các bin này vẫn bị loại khỏi độ bao phủ và không export gì; guard cho sản phẩm đã phát hành giữ nguyên — theo mẫu phòng thủ "đường vào thật chính là sản phẩm đã phát hành", bài smoke trên bin đã build vẫn chạy từng bin bằng node thuần trong thư mục tạm có hình dạng node_modules (giờ cũng symlink `ui/app-boot`), và tiếp tục khẳng định thoát với mã khác 0 khi thiếu cấu hình. Dữ kiện về chủ sở hữu bin trong [Agent Note tách các package ứng dụng ví dụ (bản ghi quyết định của agent)](../architecture/2026-06-20-extract-example-app-packages.md) đã được sửa theo đó.

## Các phương án từng cân nhắc

### Vì sao không giữ nguyên phần trùng lặp?

Khi đó các bin này được định vị là những sản phẩm đã phát hành có chủ sở hữu độc lập với nhau, còn một package mới sẽ kéo theo chi phí cố định (bản kê, README, tham chiếu tsconfig, bề mặt publint) tương đương với số dòng khử trùng lặp được. Nhưng Agent Note tạo ra các bin chưa bao giờ cân nhắc việc dùng chung giữa các ứng dụng — nó hợp nhất ba bản sao `start.ts` của ví dụ vào bin rồi dừng lại ở đó; sự trôi lệch là một thực tế đã quan sát được; và lý do về lỗ hổng độ bao phủ cũng độc lập với lý do khử trùng lặp: đây là phần logic lúc chạy không tầm thường duy nhất trong kho mã được miễn khỏi cổng kiểm 100% theo từng tệp. Phương án dự phòng đã ghi lại (chỉ trích xuất phần logic thuần ra module riêng của từng ứng dụng) sẽ chấm dứt việc miễn trừ, nhưng vẫn tiếp tục khiến tri thức liên quan có hai nơi thuộc về.

## Hệ quả

- Thay đổi mã keo khởi động (thêm guard, sửa việc phân giải đường dẫn) chỉ cần thực hiện một lần, hai bin đã phát hành tự động kế thừa; các bin sẽ không trôi lệch khỏi nhau lần nữa.
- `dsh-app-boot` giữ phụ thuộc nhẹ (cordis + cặp loader/include) — nó là cơ chế khởi động, không phải diện tích bề mặt của ứng dụng.
- Bản thân các tệp bin gần như chỉ là tổ hợp tầm thường; toàn bộ logic có rẽ nhánh đều nằm dưới cổng kiểm độ bao phủ.
