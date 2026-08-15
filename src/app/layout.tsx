import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import type { Lang } from "@/lib/i18n/dictionaries";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supplier Intelligence Hub",
  description: "Register, qualify, classify and discover suppliers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLang = cookies().get("lang")?.value;
  const lang: Lang = cookieLang === "ar" ? "ar" : "en";
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body>
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
