# ============================================
# Stage 1: Сборка (Build)
# ============================================
# Используем отдельный этап для компиляции TypeScript → JavaScript.
# Это позволяет не тащить devDependencies (tsc, tsx, @types/*)
# в финальный образ, уменьшая его размер и поверхность атаки.

FROM node:20-alpine AS builder

WORKDIR /app

# Сначала копируем только файлы зависимостей.
# Docker кэширует каждый слой — если package.json не менялся,
# npm install возьмётся из кэша (самый долгий этап)
COPY package.json package-lock.json* ./

RUN npm ci

# Копируем исходный код и конфиг TypeScript
COPY tsconfig.json ./
COPY src/ ./src/

# Компиляция TypeScript → JavaScript в папку dist/
RUN npm run build

# ============================================
# Stage 2: Продакшн (Production)
# ============================================
# Чистый образ только с runtime зависимостями и скомпилированным JS.
# node:20-alpine — минимальный образ (~50MB vs ~350MB для node:20)

FROM node:20-alpine

WORKDIR /app

# Копируем package.json для установки только production зависимостей
COPY package.json package-lock.json* ./

# --omit=dev — не устанавливать devDependencies (typescript, tsx, @types/*)
RUN npm ci --omit=dev

# Копируем скомпилированный JavaScript из builder этапа
COPY --from=builder /app/dist ./dist

# Порт, на котором слушает Express (config.port, по умолчанию 3001)
EXPOSE 3001

# Запуск продакшн сервера.
# node dist/index.js — запуск скомпилированного JS без tsx/ts-node
CMD ["node", "dist/index.js"]
