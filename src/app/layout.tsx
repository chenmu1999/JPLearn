import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JPLearn | 日语 N5 学习工具",
  description: "通过知识点、练习和反馈，循序渐进地学习日语 N5。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
