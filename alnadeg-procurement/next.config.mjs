/** @type {import('next').NextConfig} */
const nextConfig = {
  // تصدير ثابت: يعمل على أي استضافة مجانية دون خادم Node،
  // وبذلك لا يوجد أي مسار يمكن أن يسرّب مفاتيح الخادم.
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
