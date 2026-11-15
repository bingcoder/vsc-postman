import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { devHttpProxyPlugin } from './vite-plugins/dev-http-proxy'

export default defineConfig({
  // 相对路径产物，适配 Webview / 扩展。
  base: './',
  plugins: [react(), tailwindcss(), devHttpProxyPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        sidebar: path.resolve(__dirname, 'sidebar.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@extension': path.resolve(__dirname, './src-extension')
    }
  }
})
