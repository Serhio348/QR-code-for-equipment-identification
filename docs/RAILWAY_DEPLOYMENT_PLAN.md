# План подготовки к продакшену и деплоя на Railway

## Обзор

План по подготовке приложения к продакшену и развертыванию на платформе Railway.

---

## Этап 1: Подготовка окружения и конфигурации

### 1.1. Переменные окружения

**Файл:** `.env.production` (создать)

```env
# API URL для Google Apps Script
VITE_EQUIPMENT_API_URL=https://script.google.com/macros/s/AKfycbz73mVrbPSQVWLKs_SMO1lnL0455r5SDOAMEEYHdbVuH4Q-xw_TUujcb5bNqzpi2dGE3g/exec

# Режим приложения
VITE_APP_MODE=production

# Версия приложения
VITE_APP_VERSION=1.0.0
```

**Файл:** `.env.example` (создать для документации)

```env
VITE_EQUIPMENT_API_URL=your_api_url_here
VITE_APP_MODE=development
VITE_APP_VERSION=1.0.0
```

### 1.2. Обновление конфигурации Vite

**Файл:** `vite.config.ts`

Проверить и обновить:
- Базовый путь (`base`) для продакшена
- Настройки сборки (`build`)
- Оптимизация чанков
- Настройки PWA

### 1.3. Обновление манифеста PWA

**Файл:** `public/manifest.json`

Проверить:
- `start_url` - должен указывать на продакшен URL
- `scope` - должен быть правильным
- Иконки должны быть доступны

---

## Этап 2: Оптимизация приложения

### 2.1. Оптимизация сборки

**Файл:** `vite.config.ts`

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'qr-scanner': ['html5-qrcode'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Удалить console.log в продакшене
      },
    },
  },
});
```

### 2.2. Проверка зависимостей

**Команда:**
```bash
npm audit
npm audit fix
```

### 2.3. Оптимизация изображений и ресурсов

- Проверить размеры всех изображений
- Использовать WebP формат где возможно
- Оптимизировать иконки PWA

---

## Этап 3: Настройка Railway

### 3.1. Создание проекта на Railway

1. Зайти на [railway.app](https://railway.app)
2. Войти через GitHub
3. Создать новый проект
4. Выбрать "Deploy from GitHub repo"
5. Выбрать репозиторий проекта

### 3.2. Конфигурация Railway

**Файл:** `railway.json` (создать в корне проекта)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run preview",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Альтернатива:** Использовать `nixpacks.toml` для более детальной настройки

**Файл:** `nixpacks.toml` (создать)

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm run preview"
```

### 3.3. Переменные окружения в Railway

В настройках проекта Railway добавить переменные:

```
VITE_EQUIPMENT_API_URL=https://script.google.com/macros/s/AKfycbz73mVrbPSQVWLKs_SMO1lnL0455r5SDOAMEEYHdbVuH4Q-xw_TUujcb5bNqzpi2dGE3g/exec
VITE_APP_MODE=production
VITE_APP_VERSION=1.0.0
```

### 3.4. Настройка домена

1. В Railway перейти в Settings → Domains
2. Добавить кастомный домен (опционально)
3. Или использовать Railway домен (например: `project-name.up.railway.app`)

---

## Этап 4: Настройка статического хостинга (альтернатива)

Если Railway не поддерживает статический хостинг напрямую, можно использовать:

### 4.1. Railway + Nginx

**Файл:** `Dockerfile` (создать)

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Файл:** `nginx.conf` (создать)

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### 4.2. Использование Railway Static

Railway поддерживает статические сайты через:
- Railway Static плагин
- Или через Docker с Nginx (как выше)

---

## Этап 5: Обновление API конфигурации

### 5.1. Обновление CORS в Google Apps Script

В `Code.gs` проверить настройки CORS:

```javascript
function doOptions(e) {
  return {
    'headers': {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600'
    }
  };
}
```

### 5.2. Обновление API URL в коде

**Файл:** `src/config/api.ts`

Убедиться, что используется переменная окружения:

```typescript
export const EQUIPMENT_API_URL = 
  import.meta.env.VITE_EQUIPMENT_API_URL || 
  'https://script.google.com/macros/s/AKfycbz73mVrbPSQVWLKs_SMO1lnL0455r5SDOAMEEYHdbVuH4Q-xw_TUujcb5bNqzpi2dGE3g/exec';
```

---

## Этап 6: Тестирование перед деплоем

### 6.1. Локальное тестирование продакшен сборки

```bash
npm run build
npm run preview
```

Проверить:
- Все страницы загружаются
- API запросы работают
- PWA функции работают
- Service Worker регистрируется
- QR сканер работает

### 6.2. Проверка производительности

- Использовать Lighthouse для проверки
- Проверить размер бандла
- Проверить время загрузки

### 6.3. Проверка безопасности

- Проверить отсутствие секретов в коде
- Проверить HTTPS настройки
- Проверить CSP заголовки (если нужны)

---

## Этап 7: Деплой на Railway

### 7.1. Первый деплой

1. Убедиться, что все изменения закоммичены и запушены в GitHub
2. Railway автоматически обнаружит изменения
3. Дождаться завершения сборки
4. Проверить деплой

### 7.2. Проверка после деплоя

- Открыть приложение по Railway URL
- Проверить все функции
- Проверить работу API
- Проверить PWA функции
- Проверить на мобильных устройствах

### 7.3. Настройка автоматического деплоя

Railway автоматически деплоит при пуше в ветку, которая подключена к проекту.

Для настройки:
1. Settings → Source
2. Выбрать ветку (например, `develop` или `main`)
3. Railway будет автоматически деплоить при каждом пуше

---

## Этап 8: Мониторинг и поддержка

### 8.1. Настройка мониторинга

- Использовать Railway метрики
- Настроить алерты при ошибках
- Мониторить использование ресурсов

### 8.2. Логирование

Railway автоматически собирает логи:
- Доступны в разделе Deployments → Logs
- Можно настроить экспорт в внешние сервисы

### 8.3. Резервное копирование

- Google Sheets данные автоматически сохраняются в Google Drive
- Код хранится в GitHub
- Railway автоматически создает бэкапы деплоев

---

## Этап 9: Документация для пользователей

### 9.1. Инструкция по установке PWA

Создать файл `docs/PWA_INSTALLATION.md` с инструкциями для пользователей.

### 9.2. Обновление README

Обновить `README.md` с информацией о:
- Деплое на Railway
- Переменных окружения
- Структуре проекта

---

## Чеклист перед деплоем

- [ ] Все переменные окружения настроены
- [ ] Продакшен сборка работает локально
- [ ] Все тесты пройдены
- [ ] API URL обновлен
- [ ] PWA манифест обновлен
- [ ] Service Worker работает
- [ ] Оптимизация сборки выполнена
- [ ] Безопасность проверена
- [ ] Документация обновлена
- [ ] Railway проект создан
- [ ] Переменные окружения добавлены в Railway
- [ ] Домен настроен (если нужен)
- [ ] Первый деплой выполнен
- [ ] Приложение протестировано на продакшене

---

## Полезные ссылки

- [Railway Documentation](https://docs.railway.app/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [PWA Best Practices](https://web.dev/pwa-checklist/)

---

## Примечания

1. **Railway Pricing**: Railway предлагает бесплатный план с ограничениями. Проверить актуальные тарифы на сайте.

2. **Альтернативные платформы**: Если Railway не подходит, можно использовать:
   - Vercel (отлично для статических сайтов)
   - Netlify (простой деплой)
   - Cloudflare Pages (быстрый и бесплатный)

3. **Google Apps Script**: Убедиться, что скрипт развернут как веб-приложение с правильными настройками доступа.

4. **HTTPS**: Railway автоматически предоставляет HTTPS сертификаты.

5. **Масштабирование**: Railway автоматически масштабирует приложение при необходимости.

