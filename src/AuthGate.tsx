import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { isValidLogin } from "./auth";

type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isChecking) return;

    setIsChecking(true);
    setError("");

    try {
      const isValid = await isValidLogin(username, password);

      if (isValid) {
        setIsAuthenticated(true);
        return;
      }

      setPassword("");
      setError(
        "Không thể sử dụng chương trình. Tên tài khoản hoặc mật khẩu không đúng.",
      );
      window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    } catch {
      setError(
        "Không thể kiểm tra thông tin đăng nhập. Hãy tải lại trang và thử lại.",
      );
    } finally {
      setIsChecking(false);
    }
  };

  if (isAuthenticated) return <>{children}</>;

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="Giới thiệu chương trình">
        <div className="login-visual-content">
          <a className="brand login-brand" href="#login" aria-label="Linh Luna T&M">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <b>Linh Luna T&amp;M</b>
              <small>Container Optimizer V5</small>
            </span>
          </a>

          <div className="login-message">
            <p className="login-eyebrow">Hệ thống lập kế hoạch đóng hàng</p>
            <h1>
              Tối ưu không gian.
              <br />
              <em>Kiểm soát từng kiện hàng.</em>
            </h1>
            <p>
              Đăng nhập để sử dụng bộ giải xếp hàng container 20GP, 40GP và
              40HC của Linh Luna T&amp;M.
            </p>
          </div>

          <div className="login-security-note">
            <span aria-hidden="true">✓</span>
            <div>
              <b>Khu vực sử dụng riêng</b>
              <small>Chỉ tài khoản được cấp quyền mới có thể tiếp tục.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel" id="login">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-lock" aria-hidden="true">●</span>
            <p>QUYỀN TRUY CẬP</p>
            <h2>Đăng nhập chương trình</h2>
            <span>Nhập tên tài khoản và mật khẩu để tiếp tục.</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="login-username">Tên tài khoản</label>
            <div className="login-input-wrap">
              <span aria-hidden="true">A</span>
              <input
                ref={usernameInputRef}
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Nhập tên tài khoản"
                required
              />
            </div>

            <label htmlFor="login-password">Mật khẩu</label>
            <div className="login-input-wrap">
              <span aria-hidden="true">••</span>
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Nhập mật khẩu"
                required
              />
              <button
                className="password-visibility"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>

            {error && (
              <div className="login-error" role="alert" aria-live="assertive">
                <span aria-hidden="true">!</span>
                <div>
                  <b>Không thể sử dụng chương trình</b>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={isChecking || !username || !password}
            >
              {isChecking ? "Đang kiểm tra..." : "Đăng nhập"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="login-help">
            Thông tin đăng nhập phân biệt chữ hoa và chữ thường.
          </p>
        </div>
      </section>
    </main>
  );
}
