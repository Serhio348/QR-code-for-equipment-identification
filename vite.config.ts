import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
  },
  server: {
    port: 3000,
    host: true, // Разрешает доступ из локальной сети
    strictPort: false, // Если порт занят, попробует другой
  },
  preview: {
    port: 3000,
    host: true,
  },
}))

