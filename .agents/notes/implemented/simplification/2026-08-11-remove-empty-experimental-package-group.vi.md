# Agent Note: Loại bỏ nhóm package experimental rỗng

Status: implemented

[English](2026-08-11-remove-empty-experimental-package-group.md) | Tiếng Việt

## Vấn đề

Cấu trúc phân cấp package dành riêng `packages/experimental/` cho các bản dựng thử nghiệm (prototype) và plugin dùng nội bộ, nhưng chưa từng có package nào sử dụng nhóm này. Nhóm rỗng này bổ sung các quy tắc về vị trí đặt, dependency, promotion và phát hành, nhưng lại không có package hiện có hay cơ chế phát hành nào cần đến các quy tắc đó.

Nhóm ban đầu nhằm mục đích cho phép các team chia sẻ prototype dựa trên đồ thị plugin thực tế, mà không ngụ ý rằng sản phẩm sẽ hỗ trợ nó. Nhu cầu này có thể xuất hiện trong tương lai, nhưng trước khi có package cụ thể, nó chưa đủ để biện minh cho một chuyên mục vĩnh viễn trong repo.

## Quyết định

Cấu trúc phân cấp package không còn dành riêng nhóm experimental hay dùng nội bộ nào nữa. Package tiếp tục được đặt vào nhóm tương ứng với trách nhiệm sản phẩm hiện tại của nó.

Nếu một package cụ thể cần cách xử lý phát hành, độ ổn định hoặc dependency khác biệt, quyết định đó phải được đưa ra dựa trên bên tiêu thụ thực tế và cơ chế phát hành thực tế của nó. Chỉ khi quyết định đó đồng thời định nghĩa và thực thi các quy tắc loại trừ, mới có thể tái giới thiệu một nhóm chuyên biệt.

Agent Note này hợp nhất và thay thế quyết định về nhóm package experimental; bộ ba file đang hoạt động của quyết định cũ đó bị xóa cùng với thư mục rỗng.

## Các phương án thay thế đã cân nhắc

**Giữ nhóm rỗng.** Cách này cung cấp một vị trí rõ ràng cho công việc ươm mầm (incubation) trong tương lai, nhưng cũng giữ lại các quy tắc repo không có chủ sở hữu, package hay cơ chế thực thi hiện tại nào.

**Chuyển các quy tắc experimental vào chỉ dẫn package chung.** Cách này có thể duy trì chính sách mà không cần giữ thư mục rỗng, nhưng sẽ khiến mỗi lần thay đổi package đều mang theo các quy tắc dành cho một chuyên mục package giả định.

**Đặt các package experimental cụ thể vào nhóm trách nhiệm sản phẩm, và đánh dấu bằng README.** Cách này giữ được việc đặt cùng nhóm theo trách nhiệm sản phẩm, nhưng chỉ đánh dấu thôi thì không thể thực thi các quy tắc phát hành và dependency runtime. Các package trong tương lai có thể đánh giá phương án này dựa trên cơ chế phát hành thực tế.

**Coi mọi package là experimental cho đến khi phiên bản gắn tag đầu tiên được phát hành.** Cách này áp đặt một trạng thái tạm thời trên diện rộng, nhưng không cung cấp cách xử lý lâu dài cho những package vẫn ở trạng thái experimental sau khi việc phát hành đã bắt đầu.

**Yêu cầu prototype nằm ngoài repo.** Cách này sẽ mất đi đồ thị plugin thực tế, ví dụ, snapshot và kiểm tra vòng đời. Việc loại bỏ nhóm dành riêng không áp đặt ràng buộc này; các prototype cụ thể có thể tự thiết lập quy tắc vị trí mà chúng cần.

## Hệ quả

Cấu trúc phân cấp package loại bỏ nhóm chưa sử dụng cùng chính sách phát hành và dependency đặc biệt của nó, đồng thời từ bỏ vị trí phát hiện dành cho team đã khai báo sẵn và tuyến promotion có sẵn.

Package đầu tiên cần cách xử lý experimental hay dùng nội bộ phải định nghĩa vị trí lưu trữ, cách các phiên bản phát hành loại trừ nó, những dependency runtime nào được phép, và điều kiện để package được promotion hoặc bị loại bỏ. Khi các quy tắc này có bên tiêu thụ hiện tại và cơ chế thực thi được, nhóm chuyên biệt có thể được khôi phục.
