import { Sprout, Wrench } from "lucide-react";
export function SetupState() {
  return (
    <main className="setup-page">
      <div className="brand">
        <Sprout size={30} />
        <span>
          nếp<span className="brand-dot">.</span>
        </span>
      </div>
      <section className="setup-card">
        <div className="empty-icon">
          <Wrench size={30} />
        </div>
        <p className="eyebrow">SẮP SẴN SÀNG</p>
        <h1>
          Một khởi đầu nhỏ,
          <br />
          một thay đổi lớn.
        </h1>
        <p>
          Ứng dụng đang được chuẩn bị để kết nối tài khoản của bạn. Vui lòng
          quay lại sau.
        </p>
        <p className="muted">
          Mọi hành trình đều bắt đầu từ một bước đầu tiên.
        </p>
      </section>
    </main>
  );
}
