/** @type {import('next').NextConfig} */

// تصدير ثابت: يعمل على أي استضافة (GitHub Pages / Vercel / Netlify) دون خادم Node،
// وكل الحماية الفعلية في سياسات RLS داخل Supabase.
// عند النشر تحت مسار فرعي (مثل /codex على GitHub Pages) يُضبط NEXT_PUBLIC_BASE_PATH.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
