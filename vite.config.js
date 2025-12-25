// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',        // ✅ GH Pages에서 자산 경로 깨짐 방지(상대경로)
  build: {
    outDir: 'docs',  // ✅ 빌드 산출물을 /docs 로 (Pages = docs 브랜치 설정에 맞춤)
    emptyOutDir: true
  }
})
