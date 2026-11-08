import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { getLang } from "@/server/web";
import { dir, t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: { default: t(lang, "brand.name"), template: `%s · ${t(lang, "brand.name")}` }, description: t(lang, "brand.tagline") };
}

export const viewport: Viewport = { themeColor: "#3B2418", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dir(lang)}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
