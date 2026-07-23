# Kết quả kiểm thử Linh Luna Container Optimizer V5

## Mục tiêu tối ưu

V5 áp dụng thứ tự ưu tiên cố định:

1. Không vượt kích thước, tải trọng và các ràng buộc đã nhập.
2. Xếp hết số hàng có thể xếp hợp lệ.
3. Dùng tổng số container ít nhất.
4. Nếu có nhiều phương án cùng số container, ưu tiên tổng dung tích danh nghĩa
   nhỏ hơn.

Trong chế độ **Tự chọn loại container**, bộ giải chỉ sử dụng các loại được
người dùng đánh dấu rồi vẫn áp dụng bốn mục tiêu trên.

## Ca đối chiếu chính

| Dữ liệu | Kết quả V5 |
| --- | --- |
| 50 kiện | Xếp đủ 50/50 |
| Mỗi kiện 180 × 98 × 98 cm | Phối hợp nhiều hướng xoay trong cùng lớp |
| 200 kg/kiện | Tổng 10.000 kg |
| Tự động, kích thước danh nghĩa | 2 container |
| Phân bổ | 26 + 24 kiện |

V4 trả về 3 container cho ca này vì chỉ dùng một kiểu xoay cố định cho cả dãy.
V5 dùng quy hoạch động ở độ phân giải 1 mm theo cả hai trục sàn container, nhờ
đó tìm được kiểu ghép xen kẽ bị V4 bỏ sót.

## Các nhóm kiểm thử tự động

- Đăng nhập đúng, sai mật khẩu, sai tài khoản và phân biệt chữ hoa/thường.
- Ca đối chiếu 50 kiện mới.
- Ca đối chiếu 70 kiện trước đây.
- Chỉ cho phép loại 40GP và tự tìm số lượng tối thiểu.
- Giới hạn tải hàng tối đa.
- Hàng không được xếp chồng.
- Giới hạn tải nén và số tầng.
- Hàng bắt buộc giữ mặt đứng.
- Hàng hỗn hợp.
- 50 bộ dữ liệu sinh cố định để kiểm tra va chạm, vượt biên và tải trọng.

## Phạm vi

Xếp container là bài toán tối ưu tổ hợp phức tạp. V5 cho kết quả mạnh hơn rõ rệt
ở hàng đồng nhất và tìm kiếm tổ hợp container rộng hơn V4. Với hàng hỗn hợp,
kết quả vẫn là phương án lập kế hoạch cần được kiểm tra cùng kích thước
container thực nhận, CSC plate, khả năng chịu nén của bao bì và yêu cầu chèn
buộc trước khi đóng hàng.
