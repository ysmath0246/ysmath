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
        // ✅ HashRouter 안정 (설치 후 첫 진입)
        start_url: "/ysmath/#/notices",
        scope: "/ysmath/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2563eb",
        icons: [
          {
            src: "/ysmath/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/ysmath/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            // ✅ 안드로이드에서 설치 아이콘 예쁘게(선택이지만 강추)
            src: "/ysmath/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      // ✅ GitHub Pages + SPA(특히 HashRouter)에서 안정성 올리는 옵션
      workbox: {
        navigateFallback: "/ysmath/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],

  // ✅ outDir는 “한 가지만” 써야 함
  // dist를 쓰면 제일 무난함 (Pages 설정도 보통 dist로 맞춰둠)
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
