# Настройка автоматического сбора показаний Beliot через Railway

## 📋 Обзор

Railway cron job будет автоматически собирать показания счетчиков Beliot каждый час и сохранять их в Supabase.

## 🚀 Настройка Railway

### 1. Создание проекта в Railway

1. Откройте [Railway Dashboard](https://railway.app)
2. Создайте новый проект
3. Выберите "Empty Project" или "Deploy from GitHub repo"

### 2. Настройка переменных окружения

В Railway Dashboard → Variables добавьте следующие переменные:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BELIOT_LOGIN=energo@brestvodka.by
BELIOT_PASSWORD=your-beliot-password
BELIOT_API_BASE_URL=https://beliot.by:4443/api
```

**Где получить:**
- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Settings → API
- `BELIOT_LOGIN` и `BELIOT_PASSWORD`: Учетные данные для Beliot API
- `BELIOT_API_BASE_URL`: Обычно `https://beliot.by:4443/api` (можно не указывать, если стандартный)

### 3. Настройка Cron Job

#### Вариант 1: Использование Railway Cron

1. В Railway Dashboard создайте новый сервис
2. Выберите "Cron Job"
3. Настройте расписание: `0 * * * *` (каждый час)
4. Команда запуска:
   ```bash
   npx tsx scripts/collect-beliot-readings.ts
   ```

#### Вариант 2: Использование Railway Scheduled Tasks

1. В `railway.json` добавьте:
   ```json
   {
     "crons": [
       {
         "name": "collect-beliot-readings",
         "schedule": "0 * * * *",
         "command": "npx tsx scripts/collect-beliot-readings.ts"
       }
     ]
   }
   ```

#### Вариант 3: Использование GitHub Actions (альтернатива)

Если Railway не поддерживает cron jobs напрямую, можно использовать GitHub Actions:

**Файл:** `.github/workflows/collect-readings.yml`

```yaml
name: Collect Beliot Readings

on:
  schedule:
    - cron: '0 * * * *' # Каждый час
  workflow_dispatch: # Ручной запуск

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Install tsx
        run: npm install -g tsx
      
      - name: Collect readings
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          BELIOT_LOGIN: ${{ secrets.BELIOT_LOGIN }}
          BELIOT_PASSWORD: ${{ secrets.BELIOT_PASSWORD }}
        run: npx tsx scripts/collect-beliot-readings.ts
```

### 4. Установка зависимостей

Railway автоматически установит зависимости из `package.json`, но для запуска TypeScript скриптов нужен `tsx`:

**Добавьте в `package.json`:**

```json
{
  "scripts": {
    "collect-readings": "tsx scripts/collect-beliot-readings.ts"
  },
  "devDependencies": {
    "tsx": "^4.7.0"
  }
}
```

Или используйте `npx tsx` напрямую в команде Railway.

## 🔧 Локальное тестирование

Перед развертыванием на Railway протестируйте скрипт локально:

1. Создайте файл `.env.test`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   BELIOT_LOGIN=energo@brestvodka.by
   BELIOT_PASSWORD=your-beliot-password
   ```

2. Установите зависимости:
   ```bash
   npm install
   npm install -D tsx
   ```

3. Запустите скрипт:
   ```bash
   # Загрузка переменных из .env.test
   export $(cat .env.test | xargs)
   npx tsx scripts/collect-beliot-readings.ts
   ```

## 📊 Мониторинг

### Логи Railway

- Откройте Railway Dashboard → ваш проект → Logs
- Проверяйте логи после каждого запуска cron job

### Проверка данных в Supabase

1. Откройте Supabase Dashboard → Table Editor → `beliot_device_readings`
2. Проверьте, что новые записи появляются каждый час
3. Проверьте, что нет дубликатов (благодаря `ON CONFLICT` в функции `insert_beliot_reading`)

## 🐛 Устранение неполадок

### Ошибка: "Переменные окружения не настроены"

- Проверьте, что все переменные окружения установлены в Railway Dashboard
- Убедитесь, что переменные доступны для cron job

### Ошибка: "Токен не найден в ответе API"

- Проверьте правильность `BELIOT_LOGIN` и `BELIOT_PASSWORD`
- Проверьте доступность Beliot API (может потребоваться VPN)

### Ошибка: "Ошибка получения устройств"

- Проверьте, что токен Beliot API валиден
- Проверьте доступность Beliot API

### Ошибка: "Ошибка вставки показания"

- Проверьте, что таблица `beliot_device_readings` создана в Supabase
- Проверьте, что функция `insert_beliot_reading` существует
- Проверьте права доступа Service Role key

## 📝 Расписание cron

Примеры расписаний:

- `0 * * * *` - каждый час (00:00, 01:00, 02:00, ...)
- `0 */2 * * *` - каждые 2 часа
- `0 9-17 * * *` - каждый час с 9:00 до 17:00
- `0 0 * * *` - раз в день в полночь

Формат: `минута час день месяц день_недели`

## 🔗 Связанные документы

- [BELIOT_MIGRATION_PLAN.md](./BELIOT_MIGRATION_PLAN.md) - Общий план миграции
- [create-beliot-readings-table.sql](./create-beliot-readings-table.sql) - SQL схема таблицы

---

**Последнее обновление:** 2026-01-07

