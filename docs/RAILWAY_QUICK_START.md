# Быстрый старт: Деплой на Railway

## Шаг 1: Подготовка

1. Убедитесь, что все изменения закоммичены и запушены в GitHub
2. Проверьте, что проект собирается локально:
   ```bash
   npm run build
   npm run preview
   ```

## Шаг 2: Создание проекта на Railway

1. Перейдите на [railway.app](https://railway.app)
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите "Deploy from GitHub repo"
5. Выберите репозиторий `QR-code-for-equipment-identification`
6. Выберите ветку `develop` (или `main`)

## Шаг 3: Настройка переменных окружения

В настройках проекта Railway (Settings → Variables) добавьте:

```
VITE_EQUIPMENT_API_URL=https://script.google.com/macros/s/AKfycbz73mVrbPSQVWLKs_SMO1lnL0455r5SDOAMEEYHdbVuH4Q-xw_TUujcb5bNqzpi2dGE3g/exec
VITE_APP_MODE=production
VITE_APP_VERSION=1.0.0
```

## Шаг 4: Настройка деплоя

Railway автоматически определит конфигурацию из `nixpacks.toml` или `Dockerfile`.

**Вариант 1: Использование Nixpacks (рекомендуется)**
- Railway автоматически использует `nixpacks.toml`
- Никаких дополнительных настроек не требуется

**Вариант 2: Использование Docker**
- В настройках проекта выберите "Dockerfile"
- Railway будет использовать `Dockerfile` с Nginx

## Шаг 5: Деплой

1. Railway автоматически начнет сборку при первом подключении
2. Дождитесь завершения сборки (обычно 2-5 минут)
3. После успешного деплоя Railway предоставит URL (например: `project-name.up.railway.app`)

## Шаг 6: Проверка

1. Откройте приложение по Railway URL
2. Проверьте работу всех функций:
   - Вход/регистрация
   - Список оборудования
   - Просмотр оборудования
   - Сканер QR-кодов
   - Документация
   - Журнал обслуживания

## Шаг 7: Настройка домена (опционально)

1. В Railway перейдите в Settings → Domains
2. Нажмите "Generate Domain" для получения Railway домена
3. Или добавьте свой кастомный домен

## Полезные команды

### Просмотр логов
```bash
railway logs
```

### Локальный деплой (если установлен Railway CLI)
```bash
railway login
railway link
railway up
```

## Решение проблем

### Ошибка сборки
- Проверьте логи в Railway Dashboard
- Убедитесь, что все зависимости указаны в `package.json`
- Проверьте переменные окружения

### Приложение не загружается
- Проверьте, что переменная `VITE_EQUIPMENT_API_URL` установлена
- Проверьте логи Railway
- Убедитесь, что Google Apps Script развернут как веб-приложение

### CORS ошибки
- Убедитесь, что в Google Apps Script настроен CORS (функция `doOptions`)
- Проверьте, что API URL правильный

## Дополнительная информация

Подробный план деплоя см. в [RAILWAY_DEPLOYMENT_PLAN.md](./RAILWAY_DEPLOYMENT_PLAN.md)

