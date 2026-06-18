import { defineConfig } from 'vite';

// 后端 API 地址（开发用本地 wrangler，生产用部署的 CF Workers URL）
const API_BASE = process.env.GUIDEBOOK_API || 'http://localhost:8787';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    port: 5173,
    // 把 /api/* 请求代理到后端 wrangler dev
    proxy: {
      '/api': {
        target: API_BASE,
        changeOrigin: true,
      },
    },
  },
});
