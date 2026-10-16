import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "منصة أيزو الاستشارية | Global ISO AI Platform",
  description: "منصة استشارات وتشغيل أنظمة الإدارة — ISO 9001:2026 أولاً",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
