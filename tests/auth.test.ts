import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { isValidLogin, validateCredentials } from "../src/auth.ts";

test("cho phép khi tài khoản và mã băm mật khẩu cùng khớp", async () => {
  const testPassword = "mat-khau-kiem-thu";
  const testHash = createHash("sha256").update(testPassword).digest("hex");

  assert.equal(
    await validateCredentials(
      "TaiKhoanKiemThu",
      testPassword,
      "TaiKhoanKiemThu",
      testHash,
    ),
    true,
  );
});

test("từ chối mật khẩu sai", async () => {
  assert.equal(await isValidLogin("LunaLinhTM", "sai-mat-khau"), false);
});

test("từ chối tài khoản sai", async () => {
  assert.equal(await isValidLogin("TaiKhoanKhac", "bat-ky"), false);
});

test("tài khoản phân biệt chữ hoa và chữ thường", async () => {
  assert.equal(await isValidLogin("lunalinhtm", "bat-ky"), false);
});
