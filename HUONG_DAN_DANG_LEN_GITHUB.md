# Hướng dẫn đăng Linh Luna V4 lên GitHub Pages

## 1. Giải nén file

Giải nén file ZIP mới. Mở thư mục:

```text
Linh-Luna-TM-Container-Optimizer-V4-GitHub-Ready
```

Trong đó đã có đầy đủ `index.html`, `src/main.tsx`, `package.json`,
`vite.config.ts` và `.github/workflows/deploy.yml`.

## 2. Tạo repository

1. Mở <https://github.com/new>.
2. Repository name: `linh-luna-container-optimizer`.
3. Chọn **Public**.
4. Không chọn tạo thêm README, `.gitignore` hoặc License.
5. Nhấn **Create repository**.

## 3. Tải mã nguồn

1. Trong repository trống, nhấn **uploading an existing file**.
2. Mở thư mục đã giải nén trên máy tính.
3. Chọn toàn bộ nội dung bên trong thư mục.
4. Kéo các mục đã chọn vào vùng tải file của GitHub.
5. Chờ GitHub tải xong rồi nhấn **Commit changes**.

Phải thấy `package.json` ngay ở trang đầu của repository. Không tải nguyên file
ZIP và không để toàn bộ dự án nằm trong một thư mục con.

Hãy tải tất cả nội dung có trong ZIP mới. Bộ ZIP đã loại sẵn `node_modules` và
`dist`, nên không cần tự bỏ bớt file nào.

## 4. Bật GitHub Pages

1. Mở **Settings** của repository.
2. Chọn **Pages** ở thanh bên trái.
3. Trong **Build and deployment → Source**, chọn **GitHub Actions**.
4. Không chọn mẫu Next.js.

## 5. Theo dõi quá trình xuất bản

1. Mở tab **Actions**.
2. Chọn workflow **Deploy Linh Luna V4**.
3. Chờ cả hai job `build` và `deploy` có dấu tích xanh.

Workflow sẽ tự chạy mỗi khi có file mới được tải lên nhánh `main`.

## 6. Mở website

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
