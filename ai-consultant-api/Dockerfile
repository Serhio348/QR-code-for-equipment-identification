# ============================================
# Stage 1: Сборка (Build)
# ============================================

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

# Отключаем автозагрузку браузеров Playwright при npm install.
# Браузеры в Docker не нужны на этапе сборки — только при запуске.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ============================================
# Stage 2: Продакшн (Production)
# ============================================

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

# Отключаем автозагрузку браузеров — используем системный Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Устанавливаем системный Chromium и его зависимости.
# Playwright запустит этот бинарник через PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
# apk add chromium — включает сам браузер (~120MB)
# nss, freetype, harfbuzz — библиотеки для рендеринга и шрифтов
# ca-certificates, ttf-freefont — сертификаты и базовые шрифты
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Путь к системному Chromium на Alpine.
# browserService.ts читает эту переменную в chromium.launch({ executablePath })
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
