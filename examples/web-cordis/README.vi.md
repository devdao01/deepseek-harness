# web-cordis

[English](README.md) | 中文

Ví dụ tự trỏ vào chính nó của [`@deepseek-ai/dsh-tool-cordis`](../../packages/extensions/tool-cordis/README.md). agent (tác tử) có thể kiểm tra tiến trình Cordis hiện tại, và gắn hoặc gỡ trong bộ nhớ các plugin do model viết ra. Plugin tạm thời sẽ biến mất khi gỡ hoặc khi tiến trình thoát, và có thể ảnh hưởng đến các session khác trong cùng tiến trình.

## Chạy

Khởi động giao diện trình duyệt:

```sh
pnpm run demo:cordis
```

Thay vào đó khởi động máy chủ tự động hóa ACP (Agent Client Protocol):

```sh
pnpm run demo:cordis acp
```

Cả hai lệnh đều cần `DEEPSEEK_API_KEY`. [Tài liệu tham khảo công cụ Cordis](../../packages/extensions/tool-cordis/README.md) định nghĩa bốn nhóm quy ước: tham số công cụ, thời gian tồn tại, hành vi dọn dẹp, và bảo mật.
