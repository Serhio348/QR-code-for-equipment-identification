import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Плагин для замены версии кэша в Service Worker при сборке
function serviceWorkerCacheVersion() {
  return {
    name: 'service-worker-cache-version',
    closeBundle() {
      // Заменяем версию кэша в sw.js только при сборке (build)
      // В dev режиме файл не изменяется
      const distSwPath = join(process.cwd(), 'dist', 'sw.js')
      
      try {
        // Генерируем версию кэша на основе timestamp
        const cacheVersion = Date.now().toString()
        
        // Обрабатываем файл в dist (Vite уже скопировал его из public)
        let swContent = readFileSync(distSwPath, 'utf-8')
        swContent = swContent.replace(/__CACHE_VERSION__/g, cacheVersion)
        writeFileSync(distSwPath, swContent, 'utf-8')
        console.log(`[SW] Cache version updated: ${cacheVersion}`)
      } catch (error) {
        // Если файл не найден, это нормально для dev режима
        // В production сборке файл должен существовать
        if (process.env.NODE_ENV === 'production') {
          console.warn('[SW] Failed to update cache version:', error)
        }
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), serviceWorkerCacheVersion()],
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
    // Исключаем тестовые файлы из production сборки
    // Vite автоматически исключает файлы, которые не импортируются в основной код,
    // но для надежности можно явно указать через exclude в tsconfig.json
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

