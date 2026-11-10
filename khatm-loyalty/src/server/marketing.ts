import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The marketing home page lives in one template (marketing/site.tpl.html) and is rendered two ways:
 * - "app": served at "/" by the platform, with self-hosted fonts, /img photos and links into the app;
 * - "standalone": a single self-contained file (Google Fonts, embedded photos) for any static host.
 */
export type Variant = "app" | "standalone";

const ROOT = process.cwd();
const PHOTOS = ["pay", "barista", "cheers", "interior", "lattes", "street"] as const;

const FONT_LINKS_APP = [
  "alexandria/500.css",
  "alexandria/600.css",
  "alexandria/700.css",
  "alexandria/800.css",
  "ibm-plex-sans-arabic/400.css",
  "ibm-plex-sans-arabic/500.css",
  "ibm-plex-sans-arabic/600.css",
]
  .map((f) => `<link rel="stylesheet" href="/fonts/${f}">`)
  .join("\n");

const FONT_LINKS_GOOGLE = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap">`;

const SKELETON_HEAD = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="/api/app-icon/192">
<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
</head>
<body>
`;

export function renderMarketing(variant: Variant, opts: { demoUrl?: string } = {}): string {
  const tpl = readFileSync(path.join(ROOT, "marketing", "site.tpl.html"), "utf8");
  const app = variant === "app";
  const vars: Record<string, string> = {
    FONTS: app ? FONT_LINKS_APP : FONT_LINKS_GOOGLE,
    HREF_START: app ? "/signup" : "#contact",
    HREF_DEMO: app ? "/join/brew-house" : (opts.demoUrl ?? "#contact"),
    DEMO_TARGET: app ? "" : ' target="_blank" rel="noopener"',
    HEAD_LINKS: app ? '<a class="login" href="/login">دخول التاجر</a>' : "",
    FOOT_LINKS: app
      ? '<span class="flinks"><a href="/login">دخول التاجر</a><a href="/pos/login">دخول الكاشير</a><a href="/privacy">سياسة الخصوصية</a></span>'
      : "",
  };
  let html = tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => vars[k] ?? "");
  html = html.replace(/\{\{IMG:([a-z]+)\}\}/g, (_, k: string) => {
    if (!(PHOTOS as readonly string[]).includes(k)) throw new Error(`unknown photo ${k}`);
    if (app) return `/img/${k}.webp`;
    const b = readFileSync(path.join(ROOT, "public", "img", `${k}.webp`)).toString("base64");
    return `data:image/webp;base64,${b}`;
  });
  return SKELETON_HEAD + html + "\n</body>\n</html>\n";
}
