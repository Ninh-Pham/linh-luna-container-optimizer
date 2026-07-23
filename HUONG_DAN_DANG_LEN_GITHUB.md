# Hướng dẫn đăng Linh Luna V5 lên GitHub Pages

## 1. Giải nén file

Giải nén file ZIP mới. Mở thư mục:

```text
Linh-Luna-TM-Container-Optimizer-V5-GitHub-Ready
```

Trong đó đã có đầy đủ `index.html`, `src/main.tsx`, `package.json`,
`vite.config.ts` và `.github/workflows/deploy.yml`.

## 2. Cập nhật repository đang chạy V4/V4.1

Nếu repository `linh-luna-container-optimizer` của bạn đang hoạt động:

1. Mở repository trên GitHub.
2. Chọn **Add file → Upload files**.
3. Mở thư mục V5 vừa giải nén.
4. Chọn toàn bộ nội dung bên trong rồi kéo vào vùng tải file.
5. Chờ tải xong và nhấn **Commit changes**.
6. Mở tab **Actions**, chờ workflow **Deploy Linh Luna V5** có dấu tích xanh.
7. Mở lại website và nhấn `Ctrl + F5`.

Các file V5 sẽ ghi đè file cùng tên. Hai file cũ
`lib/packing-engine-v4.ts` và `tests/packing-engine-v4.test.ts` nếu còn trên
GitHub không được chương trình sử dụng; có thể giữ nguyên hoặc xóa sau khi V5
đã chạy thành công.

Nếu bạn chưa có repository, làm tiếp mục 3.

## 3. Tạo repository mới

1. Mở <https://github.com/new>.
2. Repository name: `linh-luna-container-optimizer`.
3. Chọn **Public**.
4. Không chọn tạo thêm README, `.gitignore` hoặc License.
5. Nhấn **Create repository**.

## 4. Tải mã nguồn

1. Trong repository trống, nhấn **uploading an existing file**.
2. Mở thư mục đã giải nén trên máy tính.
3. Chọn toàn bộ nội dung bên trong thư mục.
4. Kéo các mục đã chọn vào vùng tải file của GitHub.
5. Chờ GitHub tải xong rồi nhấn **Commit changes**.

Phải thấy `package.json` ngay ở trang đầu của repository. Không tải nguyên file
ZIP và không để toàn bộ dự án nằm trong một thư mục con.

Hãy tải tất cả nội dung có trong ZIP mới. Bộ ZIP đã loại sẵn `node_modules` và
`dist`, nên không cần tự bỏ bớt file nào.

## 5. Bật GitHub Pages

1. Mở **Settings** của repository.
2. Chọn **Pages** ở thanh bên trái.
3. Trong **Build and deployment → Source**, chọn **GitHub Actions**.
4. Không chọn mẫu Next.js.

## 6. Theo dõi quá trình xuất bản

1. Mở tab **Actions**.
2. Chọn workflow **Deploy Linh Luna V5**.
3. Chờ cả hai job `build` và `deploy` có dấu tích xanh.

Workflow sẽ tự chạy mỗi khi có file mới được tải lên nhánh `main`.

## 7. Mở website

Khi Actions thành công, website sẽ có dạng:

```text
https://TEN-TAI-KHOAN.github.io/linh-luna-container-optimizer/
```

Nếu tài khoản GitHub là `ninh-pham`, đường dẫn sẽ là:

```text
https://ninh-pham.github.io/linh-luna-container-optimizer/
```

Bạn cũng có thể xem link chính xác tại **Settings → Pages**.

## Kiểm tra nhanh khi có lỗi

- `package.json` phải nằm ở thư mục ngoài cùng của repository.
- Thư mục `.github/workflows` phải có file `deploy.yml`.
- Tên nhánh mặc định phải là `main`.
- **Settings → Pages → Source** phải là **GitHub Actions**.
- Không sửa lệnh build hoặc đổi cấu trúc `src`.

Dữ liệu dự án được lưu trong trình duyệt bằng local storage. Dữ liệu của mỗi
trình duyệt và mỗi thiết bị là độc lập, không tự đồng bộ qua GitHub.
