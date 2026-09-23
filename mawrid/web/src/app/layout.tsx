import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-plex", display: "swap",
});
const kufi = Reem_Kufi({
  subsets: ["arabic"], weight: ["600", "700"], variable: "--font-kufi", display: "swap",
});

export const metadata: Metadata = {
  title: "مَورِد — دليل موردي الهوريكا",
  description: "دليل موردي الهوريكا في المملكة — كل مورد ببياناته النظامية وشروطه وتغطيته",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1F4D3A" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1713" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${kufi.variable}`}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="skip-link">تخطي إلى المحتوى</a>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
