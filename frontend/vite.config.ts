import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
  },
  // 开发时代理到本地 wrangler dev
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
