"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <h1>Mình thử lại nhé.</h1>
        <p>Kết nối đang gián đoạn. Dữ liệu của bạn vẫn được lưu an toàn.</p>
        <button className="button primary" onClick={reset}>
          Thử lại
        </button>
      </section>
    </main>
  );
}
