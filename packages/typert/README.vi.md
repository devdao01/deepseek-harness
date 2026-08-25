# Typert

[English](README.md) | Tiếng Việt

Typert tách biệt việc phân tích mã nguồn, lưu trữ runtime và cơ chế phát hiện của Loader.

| Gói | Trách nhiệm | Khóa Cordis |
|---|---|---|
| [`registry/`](registry/README.md) | Lưu trữ reflection và schema của gói tại runtime | `ctx.typert` |
| [`loader/`](loader/README.md) | Phát hiện các mục Loader và đăng ký sản phẩm host được sinh ra | dùng `ctx.loader`, `ctx.typert` |
| [`generator/`](generator/README.md) | Sinh sản phẩm runtime từ các kiểu trong mã nguồn | thư viện thời điểm build |
