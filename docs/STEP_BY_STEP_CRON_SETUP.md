# Пошаговая инструкция: Настройка Cron Job через GitHub Actions

## Шаг 1: Проверьте, что файл workflow существует

1. Откройте ваш проект в редакторе
2. Проверьте, что файл `.github/workflows/collect-readings.yml` существует
3. Если файла нет - он должен быть создан (уже создан в проекте)

## Шаг 2: Загрузите файл на GitHub

### Если используете Git:

```bash
# Проверьте статус
git status

# Добавьте файл
git add .github/workflows/collect-readings.yml

# Закоммитьте
git commit -m "Add GitHub Actions workflow for Beliot readings collection"

# Загрузите на GitHub
git push origin develop
```

### Если используете GitHub Desktop:

1. Откройте GitHub Desktop
2. В разделе "Changes" найдите `.github/workflows/collect-readings.yml`
3. Поставьте галочку рядом с файлом
4. Введите сообщение коммита: "Add GitHub Actions workflow"
5. Нажмите "Commit to develop"
6. Нажмите "Push origin"

## Шаг 3: Добавьте секреты в GitHub

### 3.1. Откройте настройки репозитория

1. Откройте ваш репозиторий на GitHub (https://github.com/ваш-username/QR-code-for-equipment-identification)
2. Нажмите на вкладку **Settings** (вверху страницы)
3. В левом меню найдите **Secrets and variables**
4. Нажмите **Actions**

### 3.2. Добавьте секреты

Нажмите кнопку **New repository secret** и добавьте каждый секрет:

#### Секрет 1: SUPABASE_URL

1. **Name:** `SUPABASE_URL`
2. **Secret:** Ваш URL проекта Supabase
   - Пример: `https://wslcojroanewczgqtfuk.supabase.co`
   - Где найти: Supabase Dashboard → Settings → API → Project URL
3. Нажмите **Add secret**

#### Секрет 2: SUPABASE_SERVICE_ROLE_KEY

1. **Name:** `SUPABASE_SERVICE_ROLE_KEY`
2. **Secret:** Ваш Service Role Key из Supabase
   - Где найти: Supabase Dashboard → Settings → API → Service Role Key
   - ⚠️ ВАЖНО: Используйте Service Role Key, НЕ Anon Key!
3. Нажмите **Add secret**

#### Секрет 3: BELIOT_LOGIN

1. **Name:** `BELIOT_LOGIN`
2. **Secret:** Ваш email для входа в Beliot API
   - Пример: `energo@brestvodka.by`
3. Нажмите **Add secret**

#### Секрет 4: BELIOT_PASSWORD

1. **Name:** `BELIOT_PASSWORD`
2. **Secret:** Ваш пароль для входа в Beliot API
3. Нажмите **Add secret**

#### Секрет 5: BELIOT_API_BASE_URL (опционально)

1. **Name:** `BELIOT_API_BASE_URL`
2. **Secret:** `https://beliot.by:4443/api`
   - Это значение по умолчанию, можно не добавлять
3. Нажмите **Add secret**

### 3.3. Проверьте секреты

После добавления всех секретов вы должны увидеть список:
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY
- ✅ BELIOT_LOGIN
- ✅ BELIOT_PASSWORD
- ✅ BELIOT_API_BASE_URL (опционально)

## Шаг 4: Проверьте workflow

1. Откройте вкладку **Actions** (вверху страницы репозитория)
2. В левом меню найдите **Collect Beliot Readings**
3. Если workflow не виден, проверьте, что файл загружен на GitHub

## Шаг 5: Запустите workflow вручную (тест)

1. Откройте **Actions** → **Collect Beliot Readings**
2. Нажмите **Run workflow** (справа вверху)
3. Выберите ветку: **develop** (или **main**, если основная)
4. Нажмите зеленую кнопку **Run workflow**
5. Дождитесь завершения (обычно 1-2 минуты)

## Шаг 6: Проверьте результат

### 6.1. Проверьте логи

1. В списке запусков нажмите на последний запуск
2. Откройте задачу **collect**
3. Проверьте логи выполнения

**Успешный запуск должен показать:**
```
✅ Успешно: {количество}
✅ Сбор показаний завершен
```

**Если есть ошибки:**
- Проверьте, что все секреты установлены правильно
- Проверьте логи на наличие конкретных ошибок

### 6.2. Проверьте данные в Supabase

1. Откройте Supabase Dashboard
2. Перейдите в **Table Editor** → **beliot_device_readings**
3. Проверьте, что появились новые записи

Или выполните SQL запрос:
```sql
SELECT 
  device_id,
  reading_date,
  reading_value,
  created_at
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE
ORDER BY reading_date DESC
LIMIT 10;
```

## Шаг 7: Автоматический запуск

После успешного ручного запуска workflow будет автоматически запускаться каждый час:
- В 00:00, 01:00, 02:00, ... 23:00

**Важно:** GitHub Actions может задерживать scheduled workflows до 15 минут.

## Если что-то не работает:

### Проблема: "Workflow not found"

**Решение:**
- Проверьте, что файл `.github/workflows/collect-readings.yml` загружен на GitHub
- Проверьте, что он в правильной ветке (develop или main)

### Проблема: "Secret not found"

**Решение:**
- Проверьте, что все секреты добавлены в GitHub
- Проверьте, что имена секретов точно совпадают (регистр важен!)

### Проблема: "Error: npm run collect-readings failed"

**Решение:**
- Проверьте логи выполнения
- Проверьте, что скрипт `collect-readings` существует в `package.json`
- Проверьте, что все зависимости установлены

### Проблема: "Ошибка подключения к Supabase"

**Решение:**
- Проверьте, что `SUPABASE_URL` правильный
- Проверьте, что `SUPABASE_SERVICE_ROLE_KEY` правильный (Service Role, не Anon!)
- Проверьте, что проект Supabase активен

### Проблема: "Ошибка подключения к Beliot API"

**Решение:**
- Проверьте, что `BELIOT_LOGIN` и `BELIOT_PASSWORD` правильные
- Проверьте, что Beliot API доступен
- Проверьте логи на наличие конкретных ошибок

## Альтернатива: Если GitHub Actions не подходит

Если не получается настроить GitHub Actions, можно использовать Railway:

1. Создайте отдельный сервис в Railway
2. Установите переменные окружения (те же, что и секреты)
3. Установите Cron Schedule: `0 * * * *`
4. Установите Start Command: `cd /app && npm run collect-readings`

## Итоговый чеклист:

- [ ] Файл `.github/workflows/collect-readings.yml` загружен на GitHub
- [ ] Все секреты добавлены в GitHub (Settings → Secrets → Actions)
- [ ] Workflow виден в Actions
- [ ] Ручной запуск успешен
- [ ] Данные появляются в Supabase
- [ ] Автоматический запуск работает (проверьте через час)

## Нужна помощь?

Если что-то не получается, сообщите:
1. На каком шаге возникла проблема
2. Какая ошибка появляется (скопируйте текст из логов)
3. Что вы видите в GitHub Actions

