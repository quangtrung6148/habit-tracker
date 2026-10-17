import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nếp · Mỗi ngày, tốt hơn một chút",
  description:
    "Theo dõi thói quen, nuôi dưỡng những thay đổi nhỏ và nhìn lại tiến bộ mỗi ngày.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
