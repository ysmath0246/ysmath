// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/ysmath/",

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],

      manifest: {
        name: "연상수학 학부모 페이지",
        short_name: "연상수학",
        description: "출석/공지/수업현황/결제 확인",

        // HashRouter 기준
        start_url: "/ysmath/#/notices",
        scope: "/ysmath/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2563eb",
        icons: [
          { src: "/ysmath/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/ysmath/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/ysmath/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        navigateFallback: "/ysmath/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
      },
    }),
  ],

  // ✅ GitHub Pages가 main/docs를 보고 있으니 outDir도 docs로!
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
