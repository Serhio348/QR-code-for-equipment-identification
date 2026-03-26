# syntax=docker/dockerfile:1.5
# Секреты для Vite: предпочтительно BuildKit secret (не попадает в историю слоёв как ARG):
#   docker buildx build --secret id=vite_build_env,src=./vite.build.env -t app .
# Файл vite.build.env — строки вида KEY=value (все нужные VITE_*).
# Railway пока подставляет переменные как ARG — блок ниже; SERVICE ROLE в фронт не передаём.

FROM node:20-alpine AS builder

WORKDIR /app

ARG CACHEBUST=9

COPY package*.json ./
RUN npm ci

COPY . .

# Fallback для платформ без build secrets (например Railway): объявление ARG нужно, иначе значения не попадут в build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_EQUIPMENT_API_URL
ARG VITE_AI_CONSULTANT_API_URL
ARG VITE_BELIOT_API_BASE_URL
ARG VITE_BELIOT_API_KEY
ARG VITE_BELIOT_LOGIN

RUN set -eu; \
    if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then \
      echo "Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (переменные сервиса / build args)."; \
      exit 1; \
    fi; \
    : > .env; \
    printf 'VITE_SUPABASE_URL=%s\n' "$VITE_SUPABASE_URL" >> .env; \
    printf 'VITE_SUPABASE_ANON_KEY=%s\n' "$VITE_SUPABASE_ANON_KEY" >> .env; \
    if [ -n "${VITE_EQUIPMENT_API_URL:-}" ]; then printf 'VITE_EQUIPMENT_API_URL=%s\n' "$VITE_EQUIPMENT_API_URL" >> .env; fi; \
    if [ -n "${VITE_AI_CONSULTANT_API_URL:-}" ]; then printf 'VITE_AI_CONSULTANT_API_URL=%s\n' "$VITE_AI_CONSULTANT_API_URL" >> .env; fi; \
    if [ -n "${VITE_BELIOT_API_BASE_URL:-}" ]; then printf 'VITE_BELIOT_API_BASE_URL=%s\n' "$VITE_BELIOT_API_BASE_URL" >> .env; fi; \
    if [ -n "${VITE_BELIOT_API_KEY:-}" ]; then printf 'VITE_BELIOT_API_KEY=%s\n' "$VITE_BELIOT_API_KEY" >> .env; fi; \
    if [ -n "${VITE_BELIOT_LOGIN:-}" ]; then printf 'VITE_BELIOT_LOGIN=%s\n' "$VITE_BELIOT_LOGIN" >> .env; fi; \
    npm run build; \
    rm -f .env; \
    test -f dist/index.html; \
    js_count="$(find dist/assets -name '*.js' 2>/dev/null | wc -l)"; \
    if [ "$js_count" -lt 1 ]; then echo "Сборка не создала JS в dist/assets"; exit 1; fi; \
    ls -la dist/

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
