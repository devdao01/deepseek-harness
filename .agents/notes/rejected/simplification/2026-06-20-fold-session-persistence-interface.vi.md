# Agent Note: Gộp interface persistence vào dsh-session

Status: rejected — Package Service Definition persistence độc lập là cách tách vai trò theo module đúng như kỳ vọng của capability seam persistence. Gộp nó vào `dsh-session` tuy giảm được số lượng package, nhưng lại đánh đổi mất ranh giới backend rõ ràng hơn.

[English](2026-06-20-fold-session-persistence-interface.md) | Tiếng Việt

## Vấn đề

`dsh-session-persistence` là một package Service Definition, mà các khái niệm cốt lõi của nó đã được `dsh-session` sở hữu sẵn: `SessionHeader`, `SessionEvent`, `SessionId`, `session/event` và `session/flush`. Package này bổ sung thêm service `SessionPersistence` trừu tượng, bộ điều phối ghi (write coordinator) dùng chung, và các tiện ích hỗ trợ theo quy ước. Các package provider phụ thuộc vào nó, và để hiện thực khôi phục, `agent-loop` cũng cần tra cứu service ngang hàng này khi cần.

Khi persistence còn là một thiết kế backend hoàn toàn mới, có thể thay thế được, việc tách capability seam là hợp lý. Nhưng sau khi digest có thể thay đổi (mutable summary) đã bị loại bỏ, package Service Definition này về cơ bản chỉ còn bọc quanh trách nhiệm lưu trữ của chính log phiên. Việc tiếp tục giữ nó độc lập có thể mang lại tính hình thức nhiều hơn là sự rõ ràng.

## Đề xuất

Chuyển service `SessionPersistence` trừu tượng, bộ điều phối, và các tiện ích hỗ trợ theo quy ước persistence vào `dsh-session`. JSONL và SQLite vẫn là các package backend độc lập, đăng ký service do package session sở hữu. Cách này vừa giữ được khả năng thay thế backend, vừa xóa được một package hỗ trợ và một ranh giới liên package.

PR (Pull Request) hiện thực nên cập nhật hướng dẫn [capability seam](../../implemented/architecture/2026-06-13-capability-seams.md), bổ sung ngoại lệ này: persistence khác với bash hay LLM (mô hình ngôn ngữ lớn), vì từ vựng và các sự kiện vòng đời của nó vốn dĩ đã thuộc về lĩnh vực cốt lõi của package session.

## Tiêu chí nghiệm thu

- Package `@deepseek-ai/dsh-session-persistence` bị gỡ bỏ.
- `dsh-session` export kiểu service persistence, bộ điều phối, và các tiện ích hỗ trợ theo quy ước.
- Các package backend JSONL và SQLite phụ thuộc trực tiếp vào `dsh-session`.
- Chức năng khôi phục của `agent-loop` dùng service key do package session sở hữu.
- [Session persistence](../../implemented/architecture/2026-06-14-session-persistence.md), [Shared persistence write coordinator](../../implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md) và [tài liệu package](../../../../packages/session/session-persistence/README.md) giải thích vì sao các hiện thực backend vẫn giữ độc lập.

## Những gì bị từ bỏ

`dsh-session` trở nên nặng hơn: nó vừa sở hữu log trong bộ nhớ, vừa sở hữu Service Definition persistence. Đó là cái giá phải trả. Nếu hệ sinh thái backend persistence bên thứ ba công khai đã hình thành, một package Service Definition độc lập sẽ là ranh giới SDK rõ ràng hơn; nhưng ở giai đoạn tiền phát hành, khi chưa có bên tiêu thụ bên ngoài nào, package bổ sung này giống một sự trừu tượng hóa được đưa vào quá sớm hơn.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
