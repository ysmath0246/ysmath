import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/ysmath/",

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      includeAssets: [
        "favicon.ico",
        "pwa-192.png",
        "pwa-512.png"
      ],

      manifest: {
        name: "연상수학 학부모 페이지",
        short_name: "연상수학",
        description: "출석 / 공지 / 수업현황 / 결제 확인",

        // ⭐️ 여기 핵심!!
        start_url: "/ysmath/",
        scope: "/ysmath/",
        display: "standalone",

        background_color: "#ffffff",
        theme_color: "#2563eb",

        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        navigateFallback: "/ysmath/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
