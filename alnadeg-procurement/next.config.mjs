/** @type {import('next').NextConfig} */

// عند النشر على GitHub Pages يكون الموقع تحت مسار فرعي باسم المستودع
// (مثل /codex)، فيُضبط هذا المتغير في سير العمل. وعلى نطاق مستقل
// يُترك فارغًا. Next يتكفّل بإضافة البادئة لكل رابط وملف تلقائيًا.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  // تصدير ثابت: يعمل على أي استضافة مجانية دون خادم Node،
  // وبذلك لا يوجد أي مسار يمكن أن يسرّب مفاتيح الخادم.
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
