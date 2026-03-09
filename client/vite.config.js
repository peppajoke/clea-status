import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/tasks/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/task': 'http://localhost:3000',
      '/node': 'http://localhost:3000',
    }
  }
})
