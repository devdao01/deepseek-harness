# Agent Note: Theo release sequence, phân biệt việc công khai framework npm access:vendored với việc publish công khai package native

Status: implemented

[English](2026-08-13-public-vendor-and-native-sequences.md) | 中文

## Problem

[Ba release sequence](2026-08-10-npm-release-sequences.md) khi giao đều mang `publishConfig.access: restricted`, nên mỗi package publish vào scope `@deepseek-ai` chỉ hiển thị trong nội bộ tổ chức. Năm lần release diễn tập đều chạy như vậy: `dsh@0.0.1-rc.5`, `*-rc.4` của vendor, `landlock-run@0.0.1`.

Thứ thực sự chặn người dùng công khai là **dependency bị restricted**. Mỗi package harness đều khai báo framework vendored là `peerDependency`, `dsh-sandbox-local` khai báo entry Landlock là `dependency`. Một package công khai nếu yêu cầu một package restricted, thì người ngoài tổ chức hoàn toàn không cài được; nên hai sequence này phải công khai trước, họ dsh mới có thể công khai — và trong khi họ dsh vẫn còn restricted, chính hai sequence này là thứ duy nhất mà người dùng bên ngoài cần resolve tới.

## Decision

access là thuộc tính của từng release sequence, không phải thuộc tính của toàn bộ scope:

| Sequence | Thành viên | `publishConfig.access` |
|---|---|---|
| framework vendored | 9 package `vendor/*` | `public` |
| native | 3 package `native/landlock-run/packages/*` | `public` |
| dsh | `packages/*/*` + `apps/*` (221 thành viên) | `restricted` |

`check-workspace-constraints.ts` xác minh từng manifest theo mức của sequence tương ứng, đây là cổng chặn scope trôi dạt: một package `vendor/*` mới được thêm mà vẫn giữ `restricted`, hoặc một thành viên dsh bị đổi thành `public`, đều sẽ khiến workspace constraint fail.

**Không đường publish nào truyền `--access`.** Một option không thể phục vụ các sequence có mức khác nhau, và option sẽ ghi đè lên manifest — nơi thực sự sở hữu sự kiện này — nên `publish.ts` không truyền, workflow của native cũng vẫn không truyền, quyết định thuộc về từng packed manifest.

Phía tiêu thụ harness tham chiếu entry Landlock đổi sang dùng `workspace:^` thay vì `workspace:*`, nên package harness khi publish sẽ chấp nhận patch và minor version của entry đó, thay vì ghim cứng một phiên bản chính xác. Entry vẫn giữ `workspace:*` với hai package nền tảng của nó — ở đó binary phải khớp chính xác tuyệt đối với phiên bản của entry.

access là thuộc tính của package, không phải thuộc tính của version: mười hai package đã publish restricted trước đó (`landlock-run@0.0.1` và `*-rc.*` của vendored) sẽ chuyển thành đọc được toàn mạng ở **lần publish tiếp theo**.

## Alternatives considered

**Đổi toàn bộ scope thành public trong một lần.** Chưa áp dụng: điều đó sẽ khiến lần publish dsh tiếp theo, chỉ vì một thay đổi manifest, vô tình trở thành công khai, thay vì xuất phát từ một quyết định publish có chủ đích. Công khai trước hai sequence dependency này là thứ tự giữ cho package đã publish ở mỗi bước đều luôn cài đặt được, và cũng là điều kiện tiên quyết cho quyết định công khai dsh trong tương lai.

**Giữ tất cả restricted, cấp quyền cho một team chỉ đọc.** `npm access grant read-only <org:team> <package>` áp dụng theo từng package, không có wildcard scope, phủ hết toàn tập nghĩa là mỗi package một lần grant, cộng thêm một tác vụ đối soát dài hạn cho package mới thêm sau này. Nó cũng chỉ phủ được thành viên tổ chức, không thể phục vụ một sản phẩm công khai có thể cài đặt được.

**Chỉ định public tại đường publish thay vì trong manifest.** Không thể thực hiện khi scope hỗn hợp — một option `--access` không thể diễn đạt hai mức — và nó sẽ ghi đè chính manifest mà workspace constraint đang xác minh.

## Consequences

- **Mười hai package này công khai kể từ lần publish tiếp theo, và không thể rollback sạch sẽ.** Quay lại scope restricted cần gói trả phí cộng với `npm access set status=private` từng package, và nội dung đã bị tải về hoặc mirror thì không thu hồi lại được.
- **`@deepseek-ai/dsh` vẫn không cài được (từ ngoài tổ chức).** Manifest của nó vẫn giữ `restricted`; điều thay đổi là dependency đã publish của nó không còn bị restricted nữa, nên việc công khai nó trong tương lai là một quyết định version, không còn là vấn đề dependency.
- **Nội dung mà hai sequence công khai giao ra trở nên đọc được toàn mạng, nên trọng lượng chính sách payload của chúng tăng lên.** `vendor/cordis` chủ đích publish `src`, vì export map của nó khai báo `./src/*`; entry Landlock theo đúng quy ước sẵn có publish `src/main.c` làm bề mặt audit.
- **Hai sequence này không còn cần gói package private.** Kiểu lỗi `402 Payment Required` từng chặn lần publish native đầu tiên sẽ không còn xuất hiện với package công khai.
- **Với sequence công khai, `npm view` không cần credential trở thành một cách kiểm tra khả dụng.** Trong giai đoạn mọi package còn restricted, máy không có credential khi gọi một package thực sự tồn tại sẽ nhận `E404`, không thể phân biệt với "version không tồn tại".
