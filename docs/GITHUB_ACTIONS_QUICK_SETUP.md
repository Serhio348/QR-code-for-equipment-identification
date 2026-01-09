# Быстрая настройка GitHub Actions для Cron Job

## ✅ Файл уже создан!

Файл `.github/workflows/collect-readings.yml` уже создан в проекте. Теперь нужно:

1. Загрузить его на GitHub
2. Добавить секреты
3. Запустить

## Шаг 1: Загрузите файл на GitHub

### Вариант A: Через терминал (если используете Git)

```bash
# Добавьте файл
git add .github/workflows/collect-readings.yml

# Закоммитьте
git commit -m "Add GitHub Actions workflow for Beliot readings collection"

# Загрузите на GitHub
git push origin develop
```

### Вариант B: Через GitHub Desktop

1. Откройте GitHub Desktop
2. В разделе "Changes" найдите `.github/workflows/collect-readings.yml`
3. Поставьте галочку
4. Введите сообщение: "Add GitHub Actions workflow"
5. Нажмите "Commit to develop"
6. Нажмите "Push origin"

### Вариант C: Через веб-интерфейс GitHub

1. Откройте репозиторий на GitHub
2. Нажмите "Add file" → "Create new file"
3. Введите путь: `.github/workflows/collect-readings.yml`
4. Скопируйте содержимое файла из проекта
5. Нажмите "Commit new file"

## Шаг 2: Добавьте секреты в GitHub

1. Откройте репозиторий на GitHub
2. Нажмите **Settings** (вверху страницы)
3. В левом меню найдите **Secrets and variables** → **Actions**
4. Нажмите **New repository secret**

### Добавьте каждый секрет:

#### 1. SUPABASE_URL
- **Name:** `SUPABASE_URL`
- **Secret:** Ваш URL из Supabase Dashboard → Settings → API → Project URL
- Пример: `https://wslcojroanewczgqtfuk.supabase.co`

#### 2. SUPABASE_SERVICE_ROLE_KEY
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Secret:** Service Role Key из Supabase Dashboard → Settings → API → Service Role Key
- ⚠️ ВАЖНО: Используйте Service Role Key, НЕ Anon Key!

#### 3. BELIOT_LOGIN
- **Name:** `BELIOT_LOGIN`
- **Secret:** Ваш email для Beliot API
- Пример: `energo@brestvodka.by`

#### 4. BELIOT_PASSWORD
- **Name:** `BELIOT_PASSWORD`
- **Secret:** Ваш пароль для Beliot API

#### 5. BELIOT_API_BASE_URL (опционально)
- **Name:** `BELIOT_API_BASE_URL`
- **Secret:** `https://beliot.by:4443/api`
- Можно не добавлять, если используется значение по умолчанию

## Шаг 3: Проверьте workflow

1. Откройте вкладку **Actions** (вверху страницы репозитория)
2. В левом меню должен появиться **"Collect Beliot Readings"**
3. Если не виден - обновите страницу или проверьте, что файл загружен

## Шаг 4: Запустите вручную (тест)

1. Откройте **Actions** → **Collect Beliot Readings**
2. Нажмите **Run workflow** (справа вверху)
3. Выберите ветку: **develop**
4. Нажмите зеленую кнопку **Run workflow**
5. Дождитесь завершения (1-2 минуты)

## Шаг 5: Проверьте результат

### В логах должно быть:
```
✅ Успешно: {количество устройств}
✅ Сбор показаний завершен
```

### В Supabase:
- Откройте таблицу `beliot_device_readings`
- Должны появиться новые записи за сегодня

## Автоматический запуск

После успешного теста workflow будет автоматически запускаться каждый час:
- 00:00, 01:00, 02:00, ... 23:00

## Преимущества GitHub Actions над Railway:

✅ **Бесплатно** - GitHub Actions бесплатен для публичных репозиториев  
✅ **Надежно** - работает стабильнее, чем Railway cron  
✅ **Видно логи** - все логи доступны в интерфейсе GitHub  
✅ **Можно запускать вручную** - кнопка "Run workflow"  
✅ **Не нужно настраивать отдельный сервис** - все в одном месте  

## Если что-то не работает:

### Проблема: Workflow не виден в Actions

**Решение:**
- Проверьте, что файл загружен на GitHub
- Обновите страницу
- Проверьте, что вы в правильной ветке (develop)

### Проблема: Ошибка "Secret not found"

**Решение:**
- Проверьте, что все секреты добавлены
- Проверьте, что имена секретов точно совпадают (регистр важен!)
- Убедитесь, что секреты не пустые

### Проблема: Ошибка при выполнении скрипта

**Решение:**
- Откройте логи выполнения
- Проверьте, что все секреты правильные
- Проверьте подключение к Supabase и Beliot API

## Итоговый чеклист:

- [ ] Файл `.github/workflows/collect-readings.yml` загружен на GitHub
- [ ] Все секреты добавлены (4 обязательных)
- [ ] Workflow виден в Actions
- [ ] Ручной запуск успешен
- [ ] Данные появляются в Supabase
- [ ] Автоматический запуск работает (проверьте через час)

## Готово!

После выполнения всех шагов cron job будет работать автоматически каждый час через GitHub Actions.

