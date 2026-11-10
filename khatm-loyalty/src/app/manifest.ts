import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ختم — الكاشير",
    short_name: "ختم",
    description: "Khatm cashier: scan loyalty cards and add stamps",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F5FB",
    theme_color: "#FF5A3C",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/api/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
