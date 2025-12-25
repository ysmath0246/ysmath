// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/parents-web/',
  plugins: [react()],
  build: {
    outDir: 'docs',       // ← dist 대신 docs를 쓴다!
    emptyOutDir: true,    // ← 이전 docs는 모두 비우고 덮어쓰기
  },
  optimizeDeps: {
    exclude: ['react-router-dom'],
    include: ['set-cookie-parser','cookie']
  }
})
