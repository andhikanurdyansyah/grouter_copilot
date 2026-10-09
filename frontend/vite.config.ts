import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// gRouter Copilot dashboard app.
// base '/app/' supaya bundle tidak bentrok dengan /assets milik landing (protected).
export default defineConfig({
  base: '/app/',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4600',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
