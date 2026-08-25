# Agent Note: Vị trí thư mục gốc lưu trữ và khôi phục phương tiện phái sinh

Status: proposed

[English](2026-07-28-storage-root-and-derived-medium-recovery.md) | 中文

## Vấn đề

Cache chiếu bền vững ([bản ghi quyết định](2026-07-27-session-projection-and-command-log.md), đã được triển khai thành `dsh-session-projection-cache`) bộc lộ hai lỗ hổng của nền tảng lưu trữ mà nó dựa vào. Cả hai đều là thuộc tính của ngăn xếp domain-KV ([thiết kế](2026-07-24-domain-kv-storage-and-workspace.md)) chứ không phải vấn đề của riêng cache, và cả hai đều va vào cache trước tiên — vì nó là phương tiện *phái sinh* đầu tiên trên ngăn xếp này.

**File thực sự nằm ở đâu (sai lệch gốc đã được khắc phục, phần dư resolve-once vẫn còn mở).** Base dùng chung mặc định lưu trữ phiên vào harness home toàn cục (`$DSH_HOME/sessions`, mặc định `~/.dsh/sessions`), trong khi overlay Web xuất xưởng trước đây từng cho backend json một gốc tương đối `./.storages`: `workspace.json` và `session_projcache.json` nằm dưới `<thư mục khởi động>/.storages/` — khởi động từ hai thư mục khác nhau, cùng một phiên, nhưng registry workspace và cache chiếu lại mỗi nơi một bản, trong khi ý nghĩa tồn tại của cache chính là danh sách nguội xuyên phiên — mọi phiên từng được cache dưới thư mục khởi động khác đều sẽ miss. Sai lệch này đã được loại bỏ: overlay giờ dùng cùng một biểu thức `!!js` với gốc phiên để neo `storage-json.root` vào `$DSH_HOME/storages` (`apps/cli/config/web.cordis.yml`). Nguy cơ còn sót lại: `JsonStorageBackend` vẫn không bao giờ resolve gốc — mỗi lần mở unit đều join đường dẫn vào `process.cwd()` tại thời điểm đó (packages/storage/storage-json/src/index.ts); gốc của overlay xuất xưởng đã là đường dẫn tuyệt đối nên không bị ảnh hưởng, nhưng bất kỳ gốc tương đối nào (khởi động bằng Loader trần, test) vẫn có thể bị tách đôi bởi thay đổi cwd về sau — đúng thứ mà backend phiên JSONL đã phòng ngừa bằng cách "resolve một lần lúc khởi tạo" ("later process.cwd() changes cannot split one backend across roots", packages/session/session-persistence-jsonl/src/index.ts).

**Hiện giờ việc khôi phục diễn ra thế nào.** Bên trong một phương tiện lành mạnh, cache tự phục hồi hoàn toàn theo thiết kế: dòng nào không khớp `stateVersion` bị bỏ và fold lại, log bị rút ngắn xuống dưới watermark của dòng sẽ bị restore floor có neo phát hiện và trả lời bằng một lần đọc lại toàn phần, mỗi lần ghi nền đều fail-soft. Nhưng ở tầng *phương tiện* thì hoàn toàn không có khả năng khôi phục: `session_projcache.json` bị cắt cụt, bị sửa tay hoặc bị bump version sẽ khiến `openJsonUnit` thất bại với `malformed-medium`/`version-mismatch` (packages/storage/storage-json/src/format.ts), bản ghi bị trôi schema khiến việc open domain thất bại với `invalid-record` (packages/storage/storage-domain/src/index.ts), sự từ chối này lan suốt qua `SessionProjectionCache[Service.init]`, và dưới chế độ khởi động fail-loud của CLI, toàn bộ quá trình lắp ráp sẽ từ chối khởi động. Một file mà nội dung hoàn toàn có thể được dựng lại từ log phiên lại có thể khiến việc khởi động chết cứng. Điều này mâu thuẫn với chính lập trường mà gói cache tự tuyên bố ("a stale or unreadable cache costs a longer tail replay, never a wrong value") và với JSDoc của spec domain cache ("version bumps discard the whole medium") — điều thứ hai hiện mô tả một nguyện vọng chứ không phải hiện thực. Cùng đường fail-loud đó lại *đúng* đối với `workspace.json` — bản ghi workspace là dữ liệu có thẩm quyền, không thể phái sinh — nên khái niệm còn thiếu là khai báo tính thẩm quyền theo từng domain, chứ không phải thay đổi hành vi toàn cục.

## Đề xuất

Hai thay đổi độc lập, mỗi thứ giải quyết một lỗ hổng.

### Gốc lưu trữ duy nhất toàn cục (đã triển khai, hiệu chỉnh hình thái); resolve một lần lúc khởi tạo (vẫn còn mở)

- **Đã triển khai**: overlay Web xuất xưởng thông qua `dshHomePath('storages')` do app-boot cung cấp, neo `root` trực tiếp trên dòng `storage-json` vào `$DSH_HOME/storages` (mặc định `~/.dsh/storages`, song song với `~/.dsh/sessions`; tên thư mục không có dấu chấm — vì bản thân home đã là cây ẩn). Hàm phụ trợ này ủy quyền cho bộ giải quyết chuẩn `dsh-home-paths`, gốc phiên cũng dùng cùng hàm đó, không cần lặp lại quy tắc fallback và dấu ngã (tilde) của nó. Lựa chọn cuối cùng là hình thái theo dòng (do người dùng quyết định) thay vì "launcher patch + key profile `storageRoot`" (xem Phương án khác); override theo dòng vẫn đi qua lớp patch `~/.dsh/config.yaml` cá nhân. Scaffold web e2e vốn đã patch dòng đó vào một gốc tuyệt đối tạm thời, test không đụng vào home người dùng.
- **Vẫn còn mở**: `JsonStorageBackend` cần `resolve` gốc cấu hình một lần lúc khởi tạo, áp dụng nguyên lý do đã được ghi lại của backend JSONL: thay đổi `process.cwd()` về sau không được phép tách một backend thành nhiều gốc. Backend lưu trữ SQLite đã resolve đường dẫn của nó rồi.
- Áp dụng lập trường pre-release (đã thực hiện theo đó): không làm miếng vá di trú. Các triển khai từng cache dưới `<cwd>/.storages` phải hoặc tự phái sinh lại toàn bộ (workspace bootstrap lại từ index header; cache chiếu fold lại lười biếng), hoặc tự tay di chuyển hai file json một lần.

### Khai báo phương tiện phái sinh: reset thay vì từ chối khi hỏng

- `DomainSpec` thêm `recovery?: 'reject' | 'reset'` (mặc định `'reject'`). Đối tượng spec vốn đã là nguồn chân lý cho định danh và cấu trúc của một domain; việc phương tiện của nó có thẩm quyền hay phái sinh cũng là loại sự thật tương tự, nên đặt cùng chỗ. `session_projcache` khai báo `'reset'`; `workspace` giữ mặc định.
- `KvFacet` thêm một nguyên thủy: `destroy(descriptor): Promise<void>` — xóa hoàn toàn phương tiện của unit đó (json: xóa file; sqlite: drop bảng của unit đó). Giống như `open`, đây là nguyên thủy lưu trữ phía backend, không phải chính sách.
- `DomainFacility.open` khi spec khai báo `'reset'` và open thất bại đúng bằng một lỗi thuộc loại hỏng — `StorageError('version-mismatch' | 'malformed-medium')` hoặc `DomainError('invalid-record')` — sẽ ghi một cảnh báo nêu tên domain và phương tiện bị loại bỏ, gọi `destroy`, rồi mở lại từ trống một lần. Mọi thất bại khác (`backend-not-found`, `facet-unsupported`, `already-open`, lỗi I/O) dù có khai báo hay không đều giữ nguyên tắc ồn ào (loud): lỗi cấu hình và sự cố môi trường không phải phương tiện bị hỏng. Retry chỉ một lần — thất bại lần hai được lan truyền nguyên trạng, phương tiện hỏng liên tục sẽ không tạo thành vòng lặp.
- Với điều này, field version của spec domain cache mới đạt được ý nghĩa vốn có: bump `version` (hoặc để zod từ chối dòng bị trôi) sẽ thực sự loại bỏ toàn bộ phương tiện, cache được dựng lại qua các điểm ghi bình thường và đọc nguội — bậc thang khôi phục ngoài cùng, khớp với các bậc theo-dòng đã triển khai.

## Phương án khác

**Giữ nguyên `.storages` theo thư mục khởi động (hiện trạng trước thay đổi)** — bác bỏ: phiên là toàn cục, nên mọi phương tiện phái sinh từ phiên sẽ bị tách khỏi nguồn chân lý của chính nó; kịch bản động lực của cache (liệt kê toàn bộ phiên một lần) bị mất dòng có cấu trúc, index registry workspace mang theo các phiên không thể thấy được từ thư mục khởi động khác.

**launcher patch + key profile `storageRoot`** — không chọn: một dòng biểu thức yml `!!js` đã đạt được gốc toàn cục, hoàn toàn nhất quán với phân tầng sẵn có của gốc phiên; launcher patch thêm một điểm ghi đè nữa, key profile là chỗ trống khi chưa có bên tiêu thụ thực sự (override theo dòng đã có sẵn lớp patch config.yaml cá nhân để dùng).

**Chỉ trỏ route của cache chiếu vào gốc toàn cục, giữ `workspace.json` ở per-cwd** — bác bỏ: registry workspace cũng có cùng sự sai lệch toàn cục vs per-cwd y hệt, và người dùng chọn đặt cache cạnh `workspace.json` — một gốc hub giúp phương tiện cùng chỗ, mô hình tư duy đơn giản.

**Tự khôi phục cục bộ trong plugin cache (bắt lỗi hỏng trong `SessionProjectionCache[Service.init]`, xóa file, mở lại)** — bác bỏ: plugin không vượt qua tầng trừu tượng backend thì không thể biết đường dẫn phương tiện, và tương lai mỗi domain phái sinh sẽ phải chép lại cùng đoạn catch đó; facility là nơi duy nhất đã sẵn phân loại thất bại open.

**Khi hỏng thì lùi về domain tạm thời trong bộ nhớ** — bác bỏ: phần đời còn lại của tiến trình sẽ âm thầm suy giảm thành chỉ-trong-bộ-nhớ, file hỏng không bao giờ tự phục hồi; lần khởi động sau vẫn thất bại y hệt.

**Đổi tên phương tiện hỏng để đặt sang một bên (`<unit>.json.corrupt-<ts>`) thay vì xóa** — không chọn: byte hỏng của phương tiện phái sinh không có giá trị khôi phục (log mới là nguồn chân lý), xác chết sẽ tích lũy không giới hạn; xóa mới là thao tác trung thực. Nếu tương lai một domain *có thẩm quyền* nào đó muốn ngữ nghĩa reset, đổi tên đặt sang một bên mới là đúng — đây chính là lý do `recovery` được khai báo theo từng spec.

**Mọi domain đều tự động reset (không thêm field spec)** — bác bỏ dứt khoát: `workspace.json` là dữ liệu người dùng có thẩm quyền; reset âm thầm khi version bump sẽ phá hủy workspace. Tính thẩm quyền là thuộc tính của domain, phải do chủ sở hữu của nó khai báo.

## Tiêu chí nghiệm thu

- Khởi động `dsh` từ bất kỳ thư mục nào đều đọc/ghi cùng một bộ `$DSH_HOME/storages/*.json` (mặc định `~/.dsh/storages`) — đã được thỏa mãn bởi biểu thức overlay, override theo dòng đi qua lớp patch config.yaml cá nhân; backend resolve gốc tương đối một lần lúc khởi tạo (còn phải làm).
- Khi `session_projcache.json` bị cắt cụt, bump version hoặc trôi schema, quá trình lắp ráp khởi động sạch sẽ: một cảnh báo nêu tên phương tiện bị loại bỏ, file biến mất, cache được dựng lại qua vận hành bình thường, danh sách nguội dần khôi phục theo từng phiên được checkpoint lại.
- Cùng loại hỏng đó xảy ra với `workspace.json` vẫn từ chối khởi động ồn ào.
- Test facility bao phủ: mỗi loại hỏng khiến domain `'reset'` được reset đúng một lần; thất bại không phải do hỏng vẫn ồn ào trên domain `'reset'`; domain `'reject'` lan truyền mọi thất bại; `destroy` xóa phương tiện trên cả hai backend xuất xưởng.

## Rủi ro

- **Phân loại lỗi sai dẫn đến tự động xóa file lành mạnh.** Được giảm thiểu bởi danh sách đóng các loại lỗi hỏng: reset chỉ kích hoạt trên ba mã lỗi giai đoạn phân giải xác định; ENOENT vốn đã là "unit rỗng", mọi lỗi I/O khác (EACCES, EIO) đều lan truyền ồn ào. Retry một lần giới hạn bán kính nổ ở mức mỗi lần open tối đa một lần xóa.
- **Di chuyển gốc làm thay đổi vị trí tìm kiếm của checkout hiện có.** Chấp nhận dưới lập trường pre-release (backend từ chối định dạng cũ, không có bên tiêu thụ bên ngoài); phần trên đã ghi lại cách di chuyển thủ công một lần cho ai quan tâm đến nội dung `workspace.json` per-cwd cũ.
- **`destroy` là một nguyên thủy phá hoại mới trên seam lưu trữ.** Bên gọi duy nhất là đường reset đã khai báo của facility; convention backend ghi rõ nó chỉ dành riêng cho facility, bất kỳ đường nào hướng về model hay hướng về người dùng đều không chạm được vào nó.
