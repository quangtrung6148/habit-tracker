"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Leaf,
  Mail,
  Sprout,
  TrendingUp,
} from "lucide-react";
export default function AuthForm({
  confirmationError,
}: {
  confirmationError: boolean;
}) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    confirmationError
      ? "Liên kết xác nhận đã hết hạn hoặc không hợp lệ. Đăng nhập nếu bạn đã xác nhận, hoặc đăng ký lại để nhận liên kết mới."
      : "",
  );
  const [confirmed, setConfirmed] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.get("email"),
            password: data.get("password"),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (register && result.data.confirmationRequired) {
        setConfirmed(true);
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa thể kết nối. Thử lại nhé.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <div className="brand">
          <Sprout size={30} />
          <span>
            nếp<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="auth-story-body">
          <span className="pill">
            <Leaf size={14} /> NHỎ MỖI NGÀY, LỚN DẦN THEO THỜI GIAN
          </span>
          <h1>
            Thói quen nhỏ.
            <br />
            Phiên bản tốt hơn
            <br />
            <em>của chính bạn.</em>
          </h1>
          <p>
            Không cần hoàn hảo. Chỉ cần bắt đầu,
            <br />
            và dành một chút cho mình mỗi ngày.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="plant-circle">
              <Sprout size={96} strokeWidth={1.3} />
            </div>
            <div className="float-note note-a">
              <span className="check-mini">
                <Check size={15} />
              </span>{" "}
              Một bước tiến hôm nay
            </div>
            <div className="float-note note-b">
              <TrendingUp size={20} /> Tiến bộ theo cách của bạn
            </div>
            <span className="spark spark-a">✦</span>
            <span className="spark spark-b">✧</span>
          </div>
        </div>
        <span className="auth-foot">CHẬM MÀ CHẮC. ĐỀU MÀ XA.</span>
      </aside>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">CHÀO BẠN ĐẾN VỚI NẾP</p>
          <h2>
            {confirmed
              ? "Kiểm tra email nhé!"
              : register
                ? "Bắt đầu hành trình của bạn"
                : "Hôm nay, mình lại bắt đầu."}
          </h2>
          <p className="muted">
            {confirmed
              ? "Mở liên kết xác nhận trong email để hoàn tất đăng ký. Nếu chưa thấy, hãy kiểm tra thư mục spam."
              : register
                ? "Tạo một tài khoản để lưu lại từng bước tiến nhỏ."
                : "Đăng nhập để tiếp tục nuôi dưỡng những thói quen tốt."}
          </p>
          {confirmed ? (
            <>
              <div className="confirmation-icon">
                <Mail size={44} />
              </div>
              <button
                className="button primary full"
                onClick={() => {
                  setConfirmed(false);
                  setRegister(false);
                }}
              >
                Quay lại đăng nhập <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  placeholder="ban@example.com"
                  required
                  autoComplete="email"
                  maxLength={254}
                />
              </label>
              <label>
                Mật khẩu
                <input
                  type="password"
                  name="password"
                  placeholder="Ít nhất 8 ký tự"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Đang xử lý…"
                  : register
                    ? "Tạo tài khoản"
                    : "Đăng nhập"}
                <ArrowRight size={18} />
              </button>
              <p className="auth-switch">
                {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register ? "Đăng nhập" : "Đăng ký miễn phí"}
                </button>
              </p>
            </form>
          )}
          <div className="auth-trust">
            <span>✦</span> Không cần chạy nhanh. Chỉ cần không dừng lại.
          </div>
        </div>
      </section>
    </main>
  );
}
