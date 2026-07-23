# Cách cập nhật màn hình đăng nhập lên GitHub

Repository đang sử dụng:

```text
linh-luna-container-optimizer
```

## Cách dễ nhất: tải đè toàn bộ mã nguồn

1. Giải nén file ZIP mới.
2. Mở repository `linh-luna-container-optimizer` trên GitHub.
3. Chọn **Add file → Upload files**.
4. Mở thư mục vừa giải nén và chọn toàn bộ nội dung bên trong.
5. Kéo toàn bộ các file và thư mục vào trang GitHub.
6. Chờ tải xong, kéo xuống cuối và nhấn **Commit changes**.
7. Mở tab **Actions**.
8. Chờ workflow **Deploy Linh Luna V5** có dấu tích xanh.
9. Mở lại đường link chương trình và nhấn `Ctrl + F5`.

Không tải nguyên file ZIP. Không xóa file:

```text
.github/workflows/deploy.yml
```

## Các file đăng nhập mới

```text
src/AuthGate.tsx
src/auth.ts
tests/auth.test.ts
```

Các file đã được sửa:

```text
src/main.tsx
src/index.css
package.json
package-lock.json
README.md
```

Sau khi GitHub Actions hoàn tất, chương trình sẽ luôn hiện màn hình đăng nhập
trước. Khi tải lại trang, người dùng phải đăng nhập lại.
