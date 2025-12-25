// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // ✅ GitHub Pages 레포 이름
  base: '/ysmath/',

  plugins: [
    react(),

    // ✅ PWA 설정
    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: ['favicon.ico'],

      manifest: {
        name: '연상수학 출석',
        short_name: '연상수학',
        description: '연상수학 출석 체크 앱',
        start_url: '/ysmath/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',

        icons: [
          {
            src: '/ysmath/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/ysmath/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],

  build: {
    outDir: 'docs',       // ✅ GitHub Pages용
    emptyOutDir: true,
  },
})
