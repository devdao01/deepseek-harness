# Agent Note: Quét dự phòng Events độc lập bù lấp khoảng trống tính đầy đủ của bề mặt Cordis

Status: implemented

[English](2026-08-09-cordis-event-walk-backstop.md) | Tiếng Việt

## Vấn đề

`gen-cordis-catalog` render mọi service và event mà projection của Typert host face phát hiện được, còn các ánh xạ trang fail-closed (`SERVICE_PAGE`, `EVENT_SCOPE_PAGE`) bảo đảm mỗi key hoặc scope được phát hiện rơi đúng vào một trang `docs/subsystems/` (cơ chế vùng trang thuộc về [quyết định chia vùng theo subsystem](../process/2026-07-28-per-subsystem-cordis-surface-regions.md)). Nhưng bản thân việc "phát hiện" trước đây chỉ có dự phòng cho service: một lần quét AST độc lập đọc từng Context merge `declare module 'cordis'`, yêu cầu mỗi key được khai báo hoặc phải được render, hoặc phải nêu lý do đích danh trong `SERVICE_WALK_EXEMPTIONS`.

Event không có lớp dự phòng như vậy. Projection chỉ duyệt các file tiếp cận được từ export của package host face, nên các merge `interface Events` nằm trong code của client face — hoặc trong bất kỳ file nào mà bộ phân tích host không chạm tới — sẽ biến mất trong im lặng: 12 event đã khai báo (`slash/input-*`, `theme/change`, `locale/change`, cùng các tín hiệu invalidation `*/changed` của client runtime) không xuất hiện trong bất kỳ tài liệu sinh ra nào, và có thêm một cái nữa cũng chẳng có cơ chế nào nhận ra. Glob của lần quét service cũng chỉ là `packages/*/*/src/*.ts`, nên 13 Context key của client face được khai báo trong các file lồng nhau (`src/client/**`) lại vô hình đúng với lần quét vốn sinh ra để ngăn việc biến mất trong im lặng.

## Quyết định

Event nhận được cơ chế đối xứng hoàn toàn với lớp dự phòng của service, và cả hai lần quét đều đọc toàn bộ cây mã nguồn của package.

`scripts/cordis-walk.ts` bổ sung `eventNameList` (tên của từng thành viên trong merge `interface Events`, đọc cả thành viên dạng method lẫn property, để những hình thái mà bộ projector sẽ từ chối cũng lọt vào lần quét); lần quét sinh ra mọi khối `declare module 'cordis'` trong file (bộ phân tích Typert đọc toàn bộ các khối, dừng ở khối đầu tiên sẽ giấu mất khối thứ hai), và bộ tiền lọc không nhạy với kiểu dấu nháy của nó khớp phần đầu `declare module` chứ không khớp văn bản nguyên văn `interface Context`, nhờ đó không còn bỏ qua các file merge chỉ chứa Events hoặc dùng dấu nháy kép. Glob quét của `gen-cordis-catalog` được đào sâu từ `packages/*/*/src/*.ts` thành `packages/*/*/src/**/*.{ts,tsx}` (hai pattern). Việc phân vùng bổ sung hướng thứ ba để canh giữ chính lần quét: mọi service key và tên event mà projection render ra cũng phải nhìn thấy được đối với lần quét, khiến hồi quy của lần quét (glob, tiền lọc, duyệt khối) trở thành lỗi cứng thay vì một sự suy biến im lặng của lớp dự phòng.

Ánh xạ duy trì thủ công mới `EVENT_WALK_EXEMPTIONS` nêu tên từng event đã khai báo mà projection không nhìn thấy, kèm lý do và README của package sở hữu bề mặt đó. Khóa là tên event đầy đủ chứ không phải scope: event của client face dùng chung scope với event host đã được render (`commands/changed` cùng tồn tại với họ `commands/*` của host), và miễn trừ ở mức scope sẽ nuốt chửng trong im lặng những hồi quy host face trong tương lai. Kiểm tra phân vùng cũng fail-closed hai chiều giống như ánh xạ service: event vô hình mà không được miễn trừ, miễn trừ cho event đã được render, miễn trừ mà không có bất kỳ khai báo merge nào — tất cả đều là lỗi cứng.

Phán quyết phân vùng được tách khỏi `computeOutputs` thành hàm thuần `walkPartitionProblems(input, maps)`, để mọi đường nghiệm thu đều có thể chứng minh bằng unit test mà không cần chạy projection của Typert; `computeOutputs` nạp cho nó model đã render cộng với kết quả quét độc lập, còn cách tổng hợp lỗi ghép trang thì giữ nguyên.

Cuộc rà soát dẫn tới quyết định này phát hiện host face vốn đã đầy đủ: 48 service được render + 10 miễn trừ walk phủ hết toàn bộ 58 Context key nhìn thấy được ở host, cả 49 event host đều được render, và mọi tên kiểu trong mọi chữ ký được render đều đã được phân loại bởi các kiểm tra fail-closed sẵn có `LINK_MAP`/`FOUNDATION_TYPE_NAMES`/`TYPE_LINK_EXEMPTIONS`. Cả 25 phát hiện (12 event, 13 key) đều thuộc client face; nay mỗi mục đều có miễn trừ đích danh trỏ tới README sở hữu nó, nhất quán với tiền lệ `appShell`/`connection` sẵn có.

## Kiểm chứng

`scripts/gen-cordis-catalog-partition.spec.ts` chứng minh từng đường nghiệm thu: phân vùng xanh, event vô hình và không được miễn trừ (báo ra file khai báo), miễn trừ cũ cho event đã được render, miễn trừ cũ cho thứ chưa từng được khai báo, đường đối xứng phía service, bề mặt đã render nhưng chưa được ánh xạ trong hai ánh xạ trang, bề mặt đã render mà lần quét không thấy (hướng thứ ba), cùng với việc lần quét chạm tới merge lồng nhau chỉ chứa Events, từng khối của file nhiều khối, phần đầu dùng dấu nháy kép và file nguồn `.tsx`. Trên cây mã nguồn thật, xóa một miễn trừ đang hoạt động sẽ khiến `gen-cordis-catalog` báo lỗi tường minh kèm tên event và file khai báo; khôi phục lại thì bộ sinh trở về lần tái sinh no-op giống hệt từng byte (85 sản phẩm, ghi 0), điều này đồng thời chứng minh các miễn trừ mới phủ đúng bề mặt hiện tại. `verify-cordis-catalog` trong doc-sync chạy kiểm tra phân vùng đó mỗi lần chạy.

## Các phương án đã cân nhắc

- **Render client face thay vì miễn trừ.** Phân tích với `faces: ['host', 'client']` và sinh vùng cho service/event của client mới là cách trị tận gốc điểm mù, nhưng nó thay đổi định vị của thư mục subsystem (tài liệu tham chiếu tầng host), và đòi hỏi phải quyết định quy thuộc trang cho các bề mặt thuần trình duyệt; `TODO(cordis-catalog-interface-services)` sẵn có đã theo dõi việc mở rộng projection. Dự phòng là bảo đảm, còn render là nâng cấp bên trên nó.
- **Miễn trừ event ở mức scope.** Ánh xạ nhỏ hơn, nhưng `commands/changed` (client) dùng chung scope `commands` với các event host đã được render, và miễn trừ cả scope sẽ nuốt chửng trong im lặng các event host face tương lai — đúng kiểu thất bại mà quyết định này muốn loại bỏ.
- **Dùng Typert để suy ra tính đầy đủ thay vì quét AST thô.** Projection và lớp dự phòng phải hỏng độc lập với nhau: bug về khả năng tiếp cận của Typert chính là đối tượng mà lớp dự phòng cần bắt, nên lần quét cố ý giữ nguyên dạng duyệt `ts.createSourceFile` mộc mạc, không dùng chung cơ chế.
- **Đặt cổng kiểm tra cho bao đóng kiểu bắc cầu của các chữ ký được render.** Đã đo trước khi quyết định: mọi tên kiểu tiếp cận được trong chữ ký được render đều đã được phân loại, còn các kiểu lồng sâu hơn theo từng trường thì do phần dán `type-equiv` duy trì thủ công trên trang và README của package sở hữu; cổng bao đóng sẽ buộc các kiểu nội bộ phải nhận một trang trong khi không có nhu cầu nào từ người đọc.

## Hệ quả

Event cordis mới — dù host hay client, ở độ sâu file nào — đều phải được render vào một trang subsystem nào đó, hoặc được nêu đích danh trong `EVENT_WALK_EXEMPTIONS` kèm chủ sở hữu tài liệu của nó; khi xóa event thì phải cho miễn trừ của nó nghỉ hưu cùng lúc. Các Context key khai báo ở bất kỳ đâu dưới `src/` nay cũng vậy. Ánh xạ duy trì thủ công tăng thêm 25 mục thuộc client face, lý do đều trỏ tới README của package, giữ cho thư mục subsystem đúng định vị tài liệu tham chiếu tầng host. `walkPartitionProblems` là nơi trú ngụ duy nhất của phán quyết phân vùng; các chiều dự phòng tương lai (như render client face, bề mặt schema) nên mở rộng nó cùng spec của nó, chứ không inline kiểm tra trở lại vào `computeOutputs`.
