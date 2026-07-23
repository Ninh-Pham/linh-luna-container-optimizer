# Linh Luna T&M – Container Optimizer V5

Công cụ hỗ trợ lập kế hoạch xếp kiện hình hộp vào container 20GP, 40GP và
40HC. Bản này đã được chuyển sang Vite thuần để chạy trực tiếp trên máy tính
và tự động xuất bản bằng GitHub Pages.

## Đăng nhập

Khi mở chương trình, người dùng phải nhập đúng tên tài khoản và mật khẩu đã
được cấp. Thông tin đăng nhập phân biệt chữ hoa và chữ thường. Nhập sai sẽ
hiện thông báo **Không thể sử dụng chương trình** và không mở giao diện tính
container.

Phiên đăng nhập chỉ tồn tại trong lần mở trang hiện tại. Khi tải lại trang,
chương trình sẽ yêu cầu đăng nhập lại.

## Chạy mã nguồn trên Windows

1. Cài **Node.js 22 LTS** từ <https://nodejs.org/>.
2. Giải nén toàn bộ file ZIP.
3. Nhấp đúp `CAI_DAT_VA_CHAY_WINDOWS.bat`.
4. Lần đầu chương trình cài thư viện rồi tự mở trình duyệt.

Bản Windows Offline được đóng gói riêng và có sẵn thư mục `dist`.

## Chạy bằng dòng lệnh

```bash
npm install
npm run dev
```

Kiểm thử và tạo bản production:

```bash
npm test
npm run build
```

## Đăng lên GitHub Pages

Xem hướng dẫn từng bước trong
[`HUONG_DAN_DANG_LEN_GITHUB.md`](HUONG_DAN_DANG_LEN_GITHUB.md).

Workflow `.github/workflows/deploy.yml` sẽ tự:

1. Cài Node.js và thư viện.
2. Chạy kiểm thử thuật toán.
3. Build website với đúng đường dẫn repository.
4. Xuất bản thư mục `dist` lên GitHub Pages.

Không cần tự tạo `index.html`, `src/main.tsx` hoặc `deploy.yml`; các file này đã
có sẵn trong bộ mã nguồn.

Kết quả và phạm vi kiểm thử V5 được ghi trong
[`KET_QUA_KIEM_THU_V5.md`](KET_QUA_KIEM_THU_V5.md).

## Cách dùng

### Nhập hàng

Mỗi dòng là một loại kiện:

- Số lượng, dài, rộng, cao và khối lượng của một kiện.
- **Được xoay:** cho phép đổi hướng đặt.
- **Giữ mặt đứng:** chỉ đổi chiều dài/rộng, không lật kiện.
- **Xoay đủ 6 hướng:** có thể lật sang mọi mặt.
- **Được chồng:** cho phép đặt kiện khác lên trên.
- **Tối đa tầng:** giới hạn số kiện cùng loại trong một cột.
- **Chịu tải trên:** tổng khối lượng tối đa được truyền xuống mặt trên của kiện.
- **Thứ tự dỡ:** số 1 là nhóm hàng cần lấy ra trước và được ưu tiên gần cửa.

### Chọn cách tính

- **Tối ưu tự động:** thử tất cả loại container và ưu tiên tổng số container
  ít nhất; nếu có nhiều phương án cùng số lượng thì chọn phương án có tổng
  dung tích danh nghĩa nhỏ hơn.
- **Tự chọn loại container:** người dùng chọn các loại được phép sử dụng, V5
  tự tìm số lượng container tối thiểu trong các loại đó.
- **Thực tế vận hành:** chừa khoảng dự phòng và kiểm tra hướng kiện qua cửa.
- **So sánh SeaRates:** dùng kích thước danh nghĩa, không chừa khoảng hở.

### Ca đối chiếu SeaRates trong V5

Với `50` kiện, mỗi kiện `180 × 98 × 98 cm`, nặng `200 kg`, V5 phối hợp nhiều
hướng xoay trong cùng một lớp và tìm được phương án `2` container, phân bổ
`26 + 24` kiện. Nút **Nạp ca đối chiếu 50 kiện** trên giao diện điền sẵn bộ dữ
liệu này.

### Những gì V5 kiểm tra

- Kích thước lọt lòng và cửa.
- Tải hàng tối đa của container.
- Va chạm và vượt biên của từng kiện.
- Mặt đỡ, giới hạn tầng và tải nén.
- Hướng đặt, khoảng hở thao tác và thứ tự dỡ.
- Trọng tâm và tải tập trung ước tính.
- Nhiều thứ tự hàng, hướng xoay và tổ hợp container.
- Quy hoạch động hai chiều cho từng lớp hàng đồng nhất để không bỏ sót kiểu
  ghép xen kẽ theo chiều dài và chiều rộng.
- Tìm kiếm toàn cục theo mục tiêu: xếp đủ hàng → ít container nhất → ít dung
  tích dư hơn.

## Lưu ý an toàn

Kết quả là phương án lập kế hoạch có kiểm chứng hình học, không phải chứng nhận
đóng hàng hoặc chèn buộc. Trước khi đóng hàng thực tế, cần xác nhận CSC plate,
kích thước container thực nhận, khả năng chịu nén của bao bì, dầm phân tải,
vật liệu chèn lót và quy định vận chuyển liên quan.

## Cấu trúc chính

- `src/App.tsx`: giao diện V5.
- `src/AuthGate.tsx`: màn hình và luồng đăng nhập.
- `src/auth.ts`: kiểm tra thông tin đăng nhập bằng mã băm.
- `src/main.tsx`: điểm khởi động Vite.
- `lib/packing-engine-v5.ts`: bộ giải V5.
- `tests/auth.test.ts`: kiểm thử đăng nhập đúng và sai.
- `tests/packing-engine-v5.test.ts`: kiểm thử thuật toán.
- `.github/workflows/deploy.yml`: tự động build và đăng GitHub Pages.
- `vite.config.ts`: cấu hình đường dẫn khi chạy trên GitHub Pages.
