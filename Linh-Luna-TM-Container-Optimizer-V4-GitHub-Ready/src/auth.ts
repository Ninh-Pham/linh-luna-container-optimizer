export const AUTH_USERNAME = "LunaLinhTM";

const AUTH_PASSWORD_SHA256 =
  "6ed01e9ad2d1463ea0a6e6e429d19419f88b02a8a2164e8e4dc0a6c49a00c66c";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function validateCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  expectedPasswordHash: string,
) {
  if (username.trim() !== expectedUsername) return false;

  const passwordHash = await sha256(password);
  return passwordHash === expectedPasswordHash;
}

export function isValidLogin(username: string, password: string) {
  return validateCredentials(
    username,
    password,
    AUTH_USERNAME,
    AUTH_PASSWORD_SHA256,
  );
}
