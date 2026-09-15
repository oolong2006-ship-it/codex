import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ConfigGate } from "@/components/ConfigGate";
import "./globals.css";

const arabic = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "بوابة مشتريات فروع شركة مطاعم الناضج",
  description: "نظام إدارة واعتماد طلبات الشراء لفروع ومواقع شركة مطاعم الناضج",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#184e34",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="skip-link">تخطي إلى المحتوى</a>
        <ConfigGate>
          <AuthProvider>{children}</AuthProvider>
        </ConfigGate>
      </body>
    </html>
  );
}
