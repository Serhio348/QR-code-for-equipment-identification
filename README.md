# Система идентификации оборудования

Веб-приложение для управления оборудованием с генерацией табличек, QR-кодов, интеграцией с Google Drive и автоматическим сбором данных со счетчиков воды через Beliot API.

## 🚀 Возможности

### Управление оборудованием
- 📋 **Список оборудования** - просмотр всех единиц оборудования с фильтрацией по типу
- ➕ **Добавление оборудования** - создание новых записей с характеристиками (только для администраторов)
- ✏️ **Редактирование** - изменение характеристик и данных оборудования (только для администраторов)
- 🗑️ **Удаление** - удаление оборудования с автоматическим удалением папки в Google Drive
- 🔍 **Поиск** - быстрый поиск оборудования по названию и характеристикам

### Типы оборудования
- 🔧 Фильтры обезжелезивания
- 🔧 Насосы
- 🔧 Резервуары
- 🔧 Клапаны
- ⚡ Электрооборудование
- 💨 Вентиляционное оборудование
- 🚿 Сантехническое оборудование
- 🏭 Прочее промышленное оборудование
- 📦 Другое

### Таблички и QR-коды
- 📄 **Табличка оборудования** - отображение всех характеристик в удобном формате
- 🔲 **QR-код** - уникальный QR-код для каждого оборудования, ведущий на папку с документацией
- 📥 **Экспорт в PDF** - сохранение таблички в PDF формате
- 🖨️ **Печать** - печать таблички оборудования

### Документация
- 📁 **Google Drive интеграция** - автоматическое создание папки для каждого оборудования
- 📎 **Список файлов** - просмотр документации из Google Drive прямо в приложении
- 🔗 **Прямые ссылки** - открытие файлов и папок в Google Drive
- 📝 **Журнал обслуживания** - отслеживание истории обслуживания оборудования
- 📷 **Фото обслуживания** - загрузка и хранение фотографий работ в Google Drive

### AI-консультант (Claude AI)
- 🤖 **Умный помощник** - AI-консультант для работы с оборудованием на основе Claude
- 💬 **Естественный диалог** - общение на русском языке, понимание контекста
- 📱 **QR-сканер в чате** - быстрый выбор оборудования через сканирование QR-кода
  - Автоматический поиск и установка контекста оборудования
  - Зелёный баннер с информацией о выбранном оборудовании
  - AI понимает контекст без явных уточнений ("покажи журнал" → журнал именно этого оборудования)
  - Ускоренная обработка запросов (поиск только в папке конкретного оборудования)
- 📷 **Мультимодальность** - загрузка и анализ фотографий оборудования (до 10MB, JPEG/PNG/GIF/WebP)
- 🔍 **Поиск оборудования** - умный поиск по названию, характеристикам, типу
- 📊 **Просмотр данных** - получение информации об оборудовании и его характеристиках
- 📝 **Журнал обслуживания** - просмотр и добавление записей в журнал обслуживания
- 📁 **Работа с документацией** - поиск и чтение файлов из Google Drive (PDF, Word, Excel)
- 📷 **Управление фото** - загрузка фото обслуживания, просмотр, поиск по описанию
- 🎙️ **Голосовой ввод** - распознавание речи для ввода сообщений (Web Speech API)
- ⚡ **Быстрые действия** - выполнение операций через диалог без навигации по интерфейсу

### Мониторинг счетчиков воды (Beliot API)
- 📊 **Просмотр показаний** - отображение текущих и архивных показаний счетчиков воды
- 📈 **Графики и диаграммы** - визуализация данных потребления воды
- 📅 **Архив данных** - просмотр исторических данных с группировкой по часам, дням, неделям, месяцам и годам
- 🔄 **Автоматическая синхронизация** - автоматический сбор данных каждый час через GitHub Actions или Railway cron
- 📱 **Мобильная оптимизация** - адаптивный интерфейс для просмотра данных на мобильных устройствах
- 🔍 **Поиск устройств** - быстрый поиск счетчиков по названию
- 📋 **Паспорт устройства** - просмотр и редактирование паспортных данных счетчиков

### Анализ качества воды
- 🧪 **Управление пунктами отбора проб** - создание и управление точками контроля качества воды
- 📝 **Ввод лабораторных анализов** - ввод результатов измерений параметров качества воды
- 📊 **Журнал анализов** - просмотр всех анализов с фильтрацией по точкам отбора проб и датам
- 📋 **Управление нормативами** - настройка допустимых и предупреждающих диапазонов для параметров
- ⚠️ **Оповещения о превышении** - автоматические оповещения при превышении нормативов
- 📄 **Загрузка PDF файлов** - прикрепление протоколов анализов к записям
- 🔍 **Проверка соответствия** - автоматическая проверка результатов измерений на соответствие нормативам
- 📈 **Параметры измерения:**
  - Железо (Fe) - мг/л
  - Щелочность - мг-экв/л
  - Жесткость - мг-экв/л
  - Окисляемость - мг O₂/л
  - pH - единицы pH
  - Температура - °C

### Аутентификация и безопасность
- 🔐 **Регистрация и вход** - безопасная аутентификация через Supabase Auth
- 🔑 **Восстановление пароля** - восстановление доступа через email
- 👥 **Управление пользователями** - система ролей (администратор/пользователь)
- 🛡️ **Управление доступом** - гибкая система контроля доступа к различным модулям приложения
  - Полная версия для десктопа с таблицей всех пользователей
  - Упрощенная мобильная версия с выпадающим списком выбора пользователя
- ⏱️ **Сессии** - автоматическое управление сессиями пользователей (8 часов)

### Мониторинг и логирование (только для администраторов)
- 📊 **Логи ошибок** - централизованная система мониторинга ошибок приложения
  - Автоматическое логирование всех ошибок в базу данных
  - Классификация по уровням серьезности (критичные, высокие, средние, низкие)
  - Фильтрация по статусу (активные/нерешенные, решенные)
  - Полная версия для десктопа с расширенными фильтрами
  - Упрощенная мобильная версия с базовыми фильтрами
  - Статистика ошибок за различные периоды
  - Возможность пометить ошибки как решенные
- 🔍 **Централизованная обработка ошибок** - автоматическое преобразование технических ошибок в понятные сообщения для пользователей
- 📈 **Статистика ошибок** - визуализация количества ошибок по уровням серьезности

### Progressive Web App (PWA)
- 📱 **Установка на устройство** - возможность установки приложения как нативного
- 🔔 **Офлайн-режим** - базовая поддержка офлайн-работы
- 🎨 **Адаптивный дизайн** - оптимизация для всех типов устройств

### Современный дизайн
- 🎨 **Минималистичный интерфейс** - современный дизайн в стиле "Modern Minimal"
- 🌈 **Градиентные фоны** - красивые градиентные фоны для улучшения визуального восприятия
- 🔤 **Современные шрифты** - использование шрифта Manrope для улучшенной читаемости
- 📐 **Адаптивная верстка** - корректное отображение на всех размерах экранов

## 🛠️ Технологии

### Frontend
- **React 18** - современная библиотека для построения пользовательских интерфейсов
- **TypeScript** - типизированный JavaScript для надежности кода
- **Vite** - быстрый сборщик и dev-сервер
- **React Router DOM** - маршрутизация в одностраничном приложении
- **Recharts** - библиотека для построения графиков и диаграмм
- **QRCode.react** - генерация QR-кодов
- **jsPDF + html2canvas** - экспорт в PDF
- **html5-qrcode** - сканирование QR-кодов

### Backend
- **Supabase** - Backend-as-a-Service для аутентификации и базы данных
  - Supabase Auth - управление пользователями
  - PostgreSQL - хранение данных оборудования, показаний счетчиков и анализов качества воды
  - Row Level Security (RLS) - безопасность на уровне строк
  - Storage API - хранение PDF файлов анализов качества воды
- **Google Apps Script** - API для работы с Google Sheets и Google Drive (legacy)
- **Google Sheets** - база данных оборудования (legacy)
- **Google Drive API** - хранение документации и фото оборудования
- **Node.js + Express** - бэкенд для AI-консультанта
  - TypeScript - типизированный код
  - Anthropic SDK - интеграция с Claude AI
  - Tool calling - вызов функций для работы с данными
  - Multimodal support - поддержка текста и изображений

### Интеграции
- **Anthropic Claude API** - AI-консультант для работы с оборудованием
- **Beliot API** - API для получения данных со счетчиков воды (beliot.by)
- **GitHub Actions** - автоматический сбор данных каждый час (альтернатива)
- **Railway Cron Jobs** - автоматический сбор данных каждый час (основной метод)

### DevOps
- **Railway** - хостинг приложения (основная платформа)
- **Docker** - контейнеризация (используется для деплоя на Railway)
- **Nginx** - веб-сервер для production (внутри Docker контейнера)
- **Nixpacks** - альтернативный билдер для Railway (резервный вариант)

## 📦 Установка

### Требования
- Node.js 18+
- npm или yarn
- Аккаунт Supabase (для аутентификации и базы данных)
- Google Apps Script проект (для работы с Google Drive, опционально)
- Аккаунт Anthropic (для AI-консультанта, опционально)

### Шаги установки

1. **Клонируйте репозиторий:**
```bash
git clone <repository-url>
cd QR-code-for-equipment-identification
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Настройте переменные окружения:**

   Создайте файл `.env.local` в корне проекта (для фронтенда):
```env
# Supabase конфигурация (обязательно)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Google Apps Script API (для работы с оборудованием)
VITE_EQUIPMENT_API_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# Beliot API (для мониторинга счетчиков воды)
VITE_BELIOT_API_BASE_URL=https://beliot.by:4443/api
VITE_BELIOT_LOGIN=your-login
VITE_BELIOT_PASSWORD=your-password
VITE_BELIOT_API_KEY=your-api-key

# AI-консультант API (опционально)
VITE_AI_CONSULTANT_API_URL=http://localhost:3001
```

   Создайте файл `ai-consultant-api/.env` (для AI-консультанта):
```env
# Supabase конфигурация (для авторизации)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Anthropic API (Claude AI)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Google Apps Script API
GAS_API_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# Сервер
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

   **Где получить:**
   - **Supabase**: Dashboard → Settings → API
     - Anon key - для фронтенда
     - Service role key - для бэкенда AI-консультанта
   - **Anthropic API**: [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys
     - **Важно**: Требуется баланс на аккаунте (Pay-as-you-go)
     - Минимум $5-10 для начала работы
   - **Google Apps Script**: См. [backend/equipment-db/README.md](backend/equipment-db/README.md)
   - **Beliot API**: Контактируйте с администратором beliot.by

4. **Настройте базу данных Supabase:**
   
   Выполните SQL скрипты для создания необходимых таблиц и функций:
   - Основная схема: `docs/supabase-schema.sql`
   - Миграции: `docs/migrations/*.sql`
   
   **Порядок выполнения миграций:**
   1. `supabase-schema.sql` - основная схема
   2. `create-beliot-readings-table.sql` - таблица показаний счетчиков
   3. `create-water-quality-tables.sql` - таблицы качества воды
   4. `add-water-quality-tables-rls.sql` - RLS политики для качества воды
   5. `add-water-quality-norms-rls.sql` - RLS политики для нормативов
   6. `add-water-quality-indexes.sql` - индексы
   7. `add-norm-compliance-to-results.sql` - проверка соответствия
   8. `add-alerts-and-incidents.sql` - оповещения и инциденты
   9. `add-water-quality-alerts-rls.sql` - RLS политики для оповещений
   10. `create-workshops-table.sql` - таблица участков
   11. `create-error-logs-table.sql` - таблица логов ошибок

5. **Запустите фронтенд:**
```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:5173`

6. **Запустите бэкенд AI-консультанта (опционально):**
```bash
cd ai-consultant-api
npm install
npm run dev
```

Бэкенд будет доступен по адресу `http://localhost:3001`

## 🏗️ Сборка для production

### Локальная сборка

```bash
npm run build
```

Собранные файлы будут в папке `dist/`

Для запуска в production:
```bash
npm start
```

### Docker сборка

Приложение использует Docker для контейнеризации и деплоя на Railway.

**Сборка Docker образа:**
```bash
docker build -t equipment-management .
```

**Запуск контейнера:**
```bash
docker run -p 8080:80 equipment-management
```

**Подробнее:** См. [docs/APPLICATION_OVERVIEW.md](docs/APPLICATION_OVERVIEW.md) раздел "🐳 Контейнеризация и деплой"

### Railway деплой

1. Подключите репозиторий к Railway
2. Настройте переменные окружения в Railway Dashboard
3. Railway автоматически обнаружит `Dockerfile` и `railway.json`
4. Автоматический деплой при каждом push в репозиторий

**Важно:** В `railway.json` указан `"builder": "DOCKERFILE"`, что означает использование Docker для сборки.

## 📖 Использование

### Основной рабочий процесс

1. **Регистрация и вход**
   - Зарегистрируйтесь или войдите в систему
   - Восстановите пароль через email, если забыли

2. **Просмотр списка оборудования**
   - На главной странице отображается список всего оборудования
   - Используйте фильтр по типу для поиска нужного оборудования
   - Кликните на карточку оборудования для просмотра деталей

3. **Добавление нового оборудования** (только для администраторов)
   - Нажмите кнопку "+ Добавить оборудование"
   - Заполните форму с характеристиками
   - Выберите тип оборудования
   - Сохраните - автоматически создастся папка в Google Drive

4. **Просмотр оборудования**
   - Откройте оборудование из списка
   - Просмотрите табличку с характеристиками
   - Отсканируйте QR-код для доступа к документации
   - Установите даты ввода в эксплуатацию и обслуживания

5. **Работа с документацией**
   - На странице оборудования отображается список файлов из Google Drive
   - Нажмите "Открыть папку" для загрузки файлов вручную
   - Кликните на файл для открытия в новой вкладке

6. **Экспорт таблички**
   - На странице оборудования нажмите "Экспортировать в PDF"
   - Табличка будет сохранена в формате PDF

7. **Мониторинг счетчиков воды**
   - Перейдите в раздел "Счетчики воды"
   - Выберите группу устройств
   - Просмотрите текущие показания или откройте архив
   - Выберите период и группировку (час, день, неделя, месяц, год)
   - Переключитесь между таблицей и графиком для визуализации данных
   - Экспортируйте данные в PDF или распечатайте

8. **AI-консультант**
   - Нажмите на кнопку "💬" в правом нижнем углу экрана
   - **Быстрый выбор оборудования через QR-код:**
     - Нажмите кнопку QR-сканера (📱) в поле ввода чата
     - Наведите камеру на QR-код оборудования
     - После успешного сканирования появится зелёный баннер с названием оборудования
     - Теперь все запросы автоматически относятся к этому оборудованию:
       - "Покажи журнал" → журнал именно этого оборудования
       - "Найди инструкцию" → файлы только из папки этого оборудования
       - "Добавь запись о ремонте" → добавление в журнал этого оборудования
     - Для сброса контекста нажмите "✕" на зелёном баннере
   - **Поиск оборудования:**
     - "Найди фильтр обезжелезивания"
     - "Покажи все насосы"
     - "Какое оборудование есть на участке А?"
   - **Просмотр информации:**
     - "Покажи характеристики ФО-0,8-1,5"
     - "Когда последнее обслуживание котла?"
   - **Журнал обслуживания:**
     - "Покажи журнал обслуживания для насоса"
     - "Добавь запись о ремонте: заменили фильтр"
   - **Работа с документацией:**
     - "Найди инструкцию к насосу"
     - "Прочитай файл паспорт.pdf"
   - **Работа с фото:**
     - Прикрепите фото (📷) к сообщению
     - "Что на этом фото?"
     - "Загрузи это фото для оборудования ФО-0,8"
     - "Покажи фото последнего обслуживания"
   - **Голосовой ввод:**
     - Нажмите на кнопку микрофона (🎙️)
     - Проговорите ваш запрос
     - Текст автоматически появится в поле ввода

9. **Анализ качества воды**
   - Перейдите в раздел "Качество воды" из главного меню
   - **Пункты отбора проб:**
     - Создайте или выберите точку отбора проб
     - Настройте периодичность отбора проб
   - **Ввод анализа:**
     - Создайте новый анализ для выбранной точки
     - Введите результаты измерений параметров
     - Загрузите PDF файл протокола (опционально)
   - **Нормативы:**
     - Настройте нормативы для параметров качества воды
     - Установите допустимые и предупреждающие диапазоны
   - **Журнал анализов:**
     - Просмотрите все анализы с фильтрацией
     - Откройте анализ для просмотра деталей
     - Удалите анализ при необходимости
   - **Оповещения:**
     - Просмотрите оповещения о превышении нормативов
     - Отслеживайте статус оповещений

10. **Управление доступом** (только для администраторов)
   - Перейдите в "Настройки доступа"
   - На десктопе: используйте таблицу для просмотра и изменения доступа всех пользователей
   - На мобильных: выберите пользователя из выпадающего списка и настройте его доступ
   - Настройте доступ пользователей к различным модулям приложения

11. **Мониторинг ошибок** (только для администраторов)
   - Перейдите в "Логи ошибок"
   - Просмотрите список всех ошибок приложения
   - Используйте фильтры для поиска нужных ошибок (статус, уровень серьезности)
   - На десктопе: доступны расширенные фильтры и полная статистика
   - На мобильных: упрощенный интерфейс с базовыми фильтрами
   - Пометьте ошибки как решенные после их устранения

## 🔧 Настройка Backend

### Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Выполните SQL скрипты из `docs/supabase-schema.sql`
3. Настройте Row Level Security (RLS) политики
4. Скопируйте URL и Anon Key в `.env.local`

Подробнее см. документацию в `docs/`

### Google Apps Script (для работы с оборудованием)

Для работы приложения необходимо настроить Google Apps Script API. Подробные инструкции см. в [backend/equipment-db/README.md](backend/equipment-db/README.md)

**Краткая инструкция:**

1. Создайте Google Sheets таблицу "База данных оборудования"
2. Создайте проект Google Apps Script
3. Скопируйте код из `backend/equipment-db/Code.gs` и `DriveOperations.gs`
4. Разверните как веб-приложение
5. Скопируйте URL в `.env.local` (переменная `VITE_EQUIPMENT_API_URL`)

### AI-консультант API (Node.js + Express)

Бэкенд для AI-консультанта работает на Node.js и интегрируется с Claude AI.

**Настройка:**

1. Перейдите в папку `ai-consultant-api`
2. Установите зависимости: `npm install`
3. Создайте файл `.env` (см. пример выше)
4. Получите API ключ на [console.anthropic.com](https://console.anthropic.com)
5. Пополните баланс на console.anthropic.com (минимум $5)
6. Запустите: `npm run dev`

**Важно:**
- Требуется отдельный баланс на [console.anthropic.com](https://console.anthropic.com)
- Это НЕ подписка claude.ai (веб-интерфейс)
- API оплачивается по модели Pay-as-you-go
- Примерная стоимость: $0.003-0.015 за запрос (зависит от контекста)

### Railway Cron Jobs (автоматический сбор данных)

Настройка автоматического сбора данных со счетчиков воды через Railway:

1. Настройте переменные окружения в Railway Dashboard:
   - `SUPABASE_URL` - URL вашего проекта Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key из Supabase Dashboard
   - `BELIOT_LOGIN` - логин для Beliot API
   - `BELIOT_PASSWORD` - пароль для Beliot API
   - `BELIOT_API_BASE_URL` - базовый URL Beliot API (опционально)

2. Cron job настроен в `railway.json` и запускается каждый час автоматически

**Примечание:** GitHub Actions также может использоваться как альтернатива (см. `.github/workflows/collect-readings.yml`)

## 📁 Структура проекта

Проект использует **feature-based архитектуру** для лучшей организации кода:

```
QR-code-for-equipment-identification/
├── src/                          # Frontend (React приложение)
│   ├── features/                 # Feature-based модули
│   │   ├── equipment/            # Управление оборудованием
│   │   │   ├── components/       # Компоненты оборудования
│   │   │   │   ├── EquipmentList.tsx
│   │   │   │   ├── EquipmentForm.tsx
│   │   │   │   ├── EquipmentPlate.tsx
│   │   │   │   ├── DriveFilesList.tsx
│   │   │   │   ├── MaintenanceLog.tsx
│   │   │   │   └── ...
│   │   │   ├── pages/            # Страницы оборудования
│   │   │   │   ├── EquipmentListPage.tsx
│   │   │   │   ├── EquipmentPage.tsx
│   │   │   │   └── EquipmentFormPage.tsx
│   │   │   ├── services/         # API для оборудования
│   │   │   │   ├── equipmentApi.ts
│   │   │   │   ├── equipmentQueries.ts
│   │   │   │   ├── equipmentMutations.ts
│   │   │   │   ├── driveApi.ts
│   │   │   │   └── maintenanceApi.ts
│   │   │   ├── hooks/            # Хуки оборудования
│   │   │   │   ├── useEquipmentData.ts
│   │   │   │   ├── useEquipmentForm.ts
│   │   │   │   └── useEquipmentDates.ts
│   │   │   ├── types/            # Типы оборудования
│   │   │   │   └── equipment.ts
│   │   │   └── constants/        # Константы
│   │   │       └── equipmentTypes.ts
│   │   │
│   │   ├── water-monitoring/     # Мониторинг счетчиков воды (Beliot)
│   │   │   ├── components/
│   │   │   │   └── BeliotDevicesTest.tsx
│   │   │   ├── pages/
│   │   │   │   └── WaterPage.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useBeliotDeviceReadings.ts
│   │   │   │   └── useBeliotDevicesStorage.ts
│   │   │   └── services/
│   │   │       ├── beliotApi.ts
│   │   │       ├── beliotAuthApi.ts
│   │   │       ├── beliotDeviceApi.ts
│   │   │       ├── beliotDevicesStorageApi.ts
│   │   │       ├── beliotObjectsApi.ts
│   │   │       └── supabaseBeliotReadingsApi.ts
│   │   │
│   │   ├── water-quality/        # Анализ качества воды
│   │   │   ├── components/
│   │   │   │   ├── WaterAnalysisForm.tsx
│   │   │   │   ├── WaterQualityNormForm.tsx
│   │   │   │   └── SamplingPointForm.tsx
│   │   │   ├── pages/
│   │   │   │   ├── WaterQualityJournalPage.tsx
│   │   │   │   ├── WaterAnalysisFormPage.tsx
│   │   │   │   ├── WaterAnalysisViewPage.tsx
│   │   │   │   ├── WaterQualityAlertsPage.tsx
│   │   │   │   ├── WaterQualityNormsPage.tsx
│   │   │   │   ├── SamplingPointsPage.tsx
│   │   │   │   └── ...
│   │   │   ├── services/
│   │   │   │   ├── waterAnalysis.ts
│   │   │   │   ├── analysisResults.ts
│   │   │   │   ├── samplingPoints.ts
│   │   │   │   ├── waterQualityNorms.ts
│   │   │   │   ├── compliance.ts
│   │   │   │   ├── alerts.ts
│   │   │   │   ├── incidents.ts
│   │   │   │   └── waterQualityStorage.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useWaterQualityMeasurements.ts
│   │   │   │   ├── useWaterQualityNorms.ts
│   │   │   │   └── useSamplingPoints.ts
│   │   │   └── types/
│   │   │       └── waterQuality.ts
│   │   │
│   │   ├── auth/                 # Аутентификация
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── RegisterPage.tsx
│   │   │   │   └── ResetPasswordPage.tsx
│   │   │   ├── services/
│   │   │   │   ├── supabaseAuthApi.ts
│   │   │   │   └── authApi.ts
│   │   │   ├── hooks/
│   │   │   │   └── useCurrentUser.ts
│   │   │   ├── contexts/
│   │   │   │   └── AuthContext.tsx
│   │   │   └── types/
│   │   │       ├── auth.ts
│   │   │       └── user.ts
│   │   │
│   │   ├── access-management/    # Управление доступом
│   │   │   ├── pages/
│   │   │   │   └── AccessSettingsPage.tsx
│   │   │   ├── services/
│   │   │   │   └── supabaseAccessApi.ts
│   │   │   ├── components/
│   │   │   │   └── AppAccessGuard.tsx
│   │   │   └── types/
│   │   │       └── access.ts
│   │   │
│   │   ├── error-logging/        # Логирование ошибок
│   │   │   ├── pages/
│   │   │   │   └── ErrorLogsPage.tsx
│   │   │   ├── services/
│   │   │   │   └── errorLogsApi.ts
│   │   │   └── utils/
│   │   │       ├── errorHandler.ts
│   │   │       └── logger.ts
│   │   │
│   │   ├── workshops/            # Управление участками
│   │   │   ├── pages/
│   │   │   │   └── WorkshopSettingsPage.tsx
│   │   │   ├── services/
│   │   │   │   └── supabaseWorkshopApi.ts
│   │   │   ├── hooks/
│   │   │   │   └── useWorkshops.ts
│   │   │   └── constants/
│   │   │       └── workshops.ts
│   │   │
│   │   ├── ai-consultant/       # AI-консультант (Claude AI)
│   │   │   ├── components/
│   │   │   │   ├── ChatWidget.tsx       # Главный виджет чата с QR-сканером
│   │   │   │   ├── ChatWidget.css       # Стили чата и контекста оборудования
│   │   │   │   ├── ChatMessage.tsx      # Компонент сообщения
│   │   │   │   ├── ChatInput.tsx        # Поле ввода с кнопками
│   │   │   │   ├── VoiceButton.tsx      # Кнопка голосового ввода
│   │   │   │   ├── PhotoButton.tsx      # Кнопка загрузки фото
│   │   │   │   └── QRButton.tsx         # Кнопка QR-сканера (новое)
│   │   │   ├── hooks/
│   │   │   │   ├── useChat.ts           # Хук чата с поддержкой контекста
│   │   │   │   └── useSpeechRecognition.ts
│   │   │   └── services/
│   │   │       └── consultantApi.ts     # API с передачей контекста
│   │   │
│   │   └── common/              # Общие компоненты и страницы
│   │       ├── pages/
│   │       │   ├── MainMenuPage.tsx
│   │       │   ├── LandingPage.tsx
│   │       │   └── NotFoundPage.tsx
│   │       └── components/
│   │           ├── LoadingSpinner.tsx
│   │           ├── StatusBadge.tsx
│   │           ├── QRCode.tsx
│   │           ├── QRScanner/
│   │           ├── InstallPWA.tsx
│   │           ├── AppFooter.tsx
│   │           ├── AppWatermark.tsx
│   │           ├── AdminModal.tsx
│   │           ├── DocumentationModal.tsx
│   │           ├── ProtectedRoute.tsx
│   │           └── ...
│   │
│   ├── shared/                   # Общие утилиты и типы
│   │   ├── utils/                # Утилиты
│   │   │   ├── routes.ts
│   │   │   ├── pathStorage.ts
│   │   │   ├── pdfExport.ts
│   │   │   ├── qrCodeParser.ts
│   │   │   ├── dateFormatting.ts
│   │   │   ├── deviceDetection.ts
│   │   │   ├── sessionStorage.ts
│   │   │   ├── toast.ts
│   │   │   └── ...
│   │   ├── services/              # Общие API сервисы
│   │   │   └── api/
│   │   │       ├── apiRequest.ts
│   │   │       ├── corsFallback.ts
│   │   │       ├── supabaseBeliotOverridesApi.ts
│   │   │       └── types.ts
│   │   ├── types/                # Общие типы
│   │   │   └── plateExport.ts
│   │   ├── config/               # Конфигурация
│   │   │   ├── api.ts
│   │   │   └── supabase.ts
│   │   └── hooks/                # Общие хуки
│   │       └── useDeviceDetection.ts
│   │
│   ├── test/                     # Тестовое окружение
│   │   ├── setup.ts              # Настройка тестов
│   │   └── mocks/
│   │       └── supabase.ts       # Моки для Supabase
│   │
│   ├── styles/                   # Глобальные стили
│   │   └── colors.css            # CSS переменные для тем
│   │
│   ├── App.tsx                   # Главный компонент приложения
│   └── main.tsx                  # Точка входа
│
├── backend/                      # Backend
│   └── equipment-db/            # Google Apps Script API
│       ├── Code.gs              # Основной код API
│       ├── DriveOperations.gs   # Операции с Google Drive (+ фото)
│       ├── README.md            # Инструкции по развертыванию
│       └── ...                  # Другие модули
│
├── ai-consultant-api/           # Backend для AI-консультанта
│   ├── src/
│   │   ├── index.ts             # Точка входа Express
│   │   ├── config/
│   │   │   └── env.ts           # Конфигурация переменных окружения
│   │   ├── middleware/
│   │   │   └── auth.ts          # Supabase JWT авторизация
│   │   ├── routes/
│   │   │   ├── chat.ts          # POST /api/chat (с поддержкой equipmentContext)
│   │   │   └── health.ts        # GET /health
│   │   ├── services/
│   │   │   └── ai/              # Multi-provider архитектура
│   │   │       ├── types.ts     # Общие типы (включая EquipmentContext)
│   │   │       ├── AIProvider.ts # Базовый интерфейс провайдера
│   │   │       ├── ProviderFactory.ts # Фабрика провайдеров
│   │   │       ├── providers/
│   │   │       │   ├── ClaudeProvider.ts  # Claude с контекстным промптом
│   │   │       │   └── GeminiProvider.ts  # Gemini с контекстным промптом
│   │   │       ├── adapters/    # Адаптеры для tool calling
│   │   │       └── index.ts     # Экспорты
│   │   └── tools/               # Tools для AI (tool calling)
│   │       ├── index.ts         # Регистрация всех tools
│   │       ├── equipmentTools.ts # Поиск и просмотр оборудования
│   │       ├── driveTools.ts    # Работа с Google Drive файлами
│   │       ├── photoTools.ts    # Загрузка и поиск фото
│   │       └── maintenanceTools.ts # Журнал обслуживания
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                     # Переменные окружения (создать вручную)
│
├── scripts/                      # Скрипты
│   ├── collect-beliot-readings.ts # Скрипт сбора данных со счетчиков
│   └── generate-icons.js         # Генерация иконок PWA
│
├── docs/                        # Документация
│   ├── APPLICATION_OVERVIEW.md  # Полный обзор приложения
│   ├── MIGRATION_PLAN.md        # План миграции с Supabase на собственный сервер
│   ├── supabase-schema.sql      # SQL схема для Supabase
│   ├── TESTING.md               # Документация по тестированию
│   ├── FIX_AUTH_ERRORS.md       # Исправление ошибок аутентификации
│   ├── PWA_UPDATE_MECHANISM.md  # Механизм обновления PWA
│   ├── WATER_QUALITY_ANALYSIS.md # Документация по модулю качества воды
│   ├── WATER_QUALITY_DEVELOPMENT_ROADMAP.md # План развития модуля
│   ├── WATER_QUALITY_MEASUREMENTS_PLAN_V2.md # План реализации (V2)
│   ├── BELIOT_API_SPEC.md       # Спецификация Beliot API
│   ├── beliot-api-openapi.json  # OpenAPI спецификация Beliot API
│   ├── DATABASE_STORAGE_MANAGEMENT.md # Управление хранилищем БД
│   ├── STORAGE_CALCULATION_20_DEVICES.md # Расчет объема данных
│   ├── migrations/              # SQL миграции
│   │   ├── create-beliot-readings-table.sql
│   │   ├── create-water-quality-tables.sql
│   │   ├── add-water-quality-tables-rls.sql
│   │   ├── add-water-quality-norms-rls.sql
│   │   ├── add-water-quality-indexes.sql
│   │   ├── add-norm-compliance-to-results.sql
│   │   ├── add-alerts-and-incidents.sql
│   │   ├── add-water-quality-alerts-rls.sql
│   │   ├── create-workshops-table.sql
│   │   ├── create-error-logs-table.sql
│   │   └── README.md
│   └── queries/                 # SQL запросы для отладки
│       ├── check-hourly-readings.sql
│       ├── check-device-by-id-template.sql
│       └── ...
│
├── Dockerfile                   # Docker конфигурация для production
├── docker-entrypoint.sh         # Скрипт запуска контейнера
├── nginx.conf.template          # Шаблон конфигурации Nginx
├── railway.json                 # Конфигурация Railway
├── nixpacks.toml                # Альтернативная конфигурация для Nixpacks
│
├── .github/                      # GitHub конфигурация
│   └── workflows/               # GitHub Actions workflows
│       └── collect-readings.yml # Автоматический сбор данных
│
└── public/                       # Статические файлы
    ├── manifest.json            # PWA манифест
    ├── sw.js                    # Service Worker
    └── icons/                   # Иконки приложения
```

## 🐛 Решение проблем

### CORS ошибки
Если возникают проблемы с CORS, проверьте настройки в Supabase Dashboard и Google Apps Script.

### Проблемы с загрузкой файлов
- Убедитесь, что Google Apps Script развернут с доступом "Все"
- Проверьте логи в Google Apps Script (Выполнения → Просмотр логов)

### Ошибки API
- Проверьте URL в `.env.local`
- Убедитесь, что Supabase проект настроен и доступен
- Проверьте настройки доступа к Google Sheets и Google Drive

### Проблемы с аутентификацией
- Проверьте переменные окружения `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`
- Убедитесь, что RLS политики настроены корректно
- Проверьте логи в консоли браузера

### Проблемы с Beliot API
- Убедитесь, что API доступен из вашей сети (может потребоваться VPN)
- Проверьте учетные данные в `.env.local`
- Проверьте логи в консоли браузера

### Railway cron jobs не работают
- Проверьте, что `railway.json` содержит правильную конфигурацию cron
- Проверьте переменные окружения в Railway Dashboard
- Проверьте логи в Railway Dashboard → Deployments → Logs
- Убедитесь, что скрипт `collect-readings` доступен в контейнере

### GitHub Actions не запускается (альтернативный метод)
- Проверьте, что все секреты настроены в Settings → Secrets
- Проверьте логи workflow в Actions → Collect Beliot Readings
- Убедитесь, что workflow включен

### Проблемы с модулем качества воды
- Проверьте, что все миграции выполнены в правильном порядке
- Убедитесь, что RLS политики настроены для всех таблиц
- Проверьте, что bucket `water-quality-analysis` создан в Supabase Storage
- Проверьте права доступа к Storage bucket

### Проблемы с AI-консультантом

#### Бэкенд не запускается
- **Ошибка**: `supabaseUrl is required` или `supabaseKey is required`
  - **Решение**: Создайте файл `ai-consultant-api/.env` с переменными окружения
  - Убедитесь, что используете `SUPABASE_SERVICE_KEY`, а не `SUPABASE_ANON_KEY`

- **Ошибка**: `Missing required environment variables: anthropicApiKey`
  - **Решение**: Добавьте `ANTHROPIC_API_KEY` в `ai-consultant-api/.env`
  - Получите ключ на [console.anthropic.com](https://console.anthropic.com)

- **Ошибка**: `EADDRINUSE: address already in use :::3001`
  - **Решение**: Порт 3001 занят другим процессом
  - Windows: `netstat -ano | findstr :3001` → `taskkill /PID <PID> /F`
  - Linux/Mac: `lsof -ti:3001 | xargs kill -9`

#### CORS ошибки
- **Ошибка**: `Access to fetch has been blocked by CORS policy`
  - **Решение**: Добавьте origin фронтенда в `ALLOWED_ORIGINS` в `ai-consultant-api/.env`
  - Пример: `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`
  - Перезапустите бэкенд после изменения

#### Ошибки Anthropic API
- **Ошибка**: `Your credit balance is too low to access the Anthropic API`
  - **Проблема**: Нулевой баланс на [console.anthropic.com](https://console.anthropic.com)
  - **Важно**: Баланс на claude.ai (веб-интерфейс) НЕ работает для API
  - **Решение**: Пополните баланс на console.anthropic.com (минимум $5-10)

- **Ошибка**: `Invalid API key`
  - **Решение**: Проверьте правильность API ключа в `ai-consultant-api/.env`
  - Ключ должен начинаться с `sk-ant-api03-`
  - Создайте новый ключ на console.anthropic.com

#### Фото не загружаются
- **Ошибка**: Фото не прикрепляются к сообщению
  - **Решение**: Проверьте размер файла (максимум 10MB)
  - Поддерживаемые форматы: JPEG, PNG, GIF, WebP

- **Ошибка**: `Ошибка загрузки фото` в Google Drive
  - **Решение**: Проверьте права доступа Google Apps Script к Drive
  - Убедитесь, что функция `uploadMaintenancePhoto()` добавлена в DriveOperations.gs

#### Голосовой ввод не работает
- **Проблема**: Кнопка микрофона неактивна
  - **Решение**: Голосовой ввод работает только в HTTPS (или localhost)
  - Убедитесь, что браузер поддерживает Web Speech API (Chrome, Edge)
  - Разрешите доступ к микрофону в браузере

## 📝 Скрипты

### Фронтенд

- `npm run dev` - запуск dev-сервера (http://localhost:5173)
- `npm run build` - сборка для production (тестовые файлы автоматически исключаются)
- `npm run preview` - предпросмотр production сборки
- `npm run collect-readings` - ручной запуск сбора данных со счетчиков
- `npm test` - запуск тестов в watch режиме
- `npm test -- --run` - однократный запуск всех тестов
- `npm test -- --ui` - запуск тестов с UI интерфейсом
- `npm test -- --coverage` - запуск тестов с покрытием кода

### AI-консультант (ai-consultant-api/)

- `npm run dev` - запуск dev-сервера с hot-reload (http://localhost:3001)
- `npm run build` - компиляция TypeScript в JavaScript
- `npm start` - запуск production сборки
- `npm run type-check` - проверка типов TypeScript без компиляции

**Примечание:** Тестовые файлы (`.test.ts`, `.spec.ts`, `__tests__/`) автоматически исключаются из production сборки через настройки в `tsconfig.json`. Они не попадают в `dist/` и не увеличивают размер production бандла.

**Документация по тестированию:** См. [docs/TESTING.md](docs/TESTING.md) для подробной информации о написании и запуске тестов.

## 🔒 Безопасность

- Все пароли хранятся в зашифрованном виде в Supabase
- Используется Row Level Security (RLS) для защиты данных
- Service Role Key используется только на сервере (GitHub Actions)
- Все пользовательские данные экранируются для предотвращения XSS

## 📚 Дополнительная документация

- [APPLICATION_OVERVIEW.md](docs/APPLICATION_OVERVIEW.md) - Полный обзор приложения, архитектура, модули
- [MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) - План миграции с Supabase на собственный сервер
- [WEB_AI_CONSULTANT_PLAN.md](docs/WEB_AI_CONSULTANT_PLAN.md) - План разработки AI-консультанта
- [WATER_QUALITY_ANALYSIS.md](docs/WATER_QUALITY_ANALYSIS.md) - Документация по модулю качества воды
- [WATER_QUALITY_DEVELOPMENT_ROADMAP.md](docs/WATER_QUALITY_DEVELOPMENT_ROADMAP.md) - План развития модуля качества воды
- [WATER_QUALITY_MEASUREMENTS_PLAN_V2.md](docs/WATER_QUALITY_MEASUREMENTS_PLAN_V2.md) - Детальный план реализации модуля качества воды
- [TESTING.md](docs/TESTING.md) - Документация по тестированию
- [FIX_AUTH_ERRORS.md](docs/FIX_AUTH_ERRORS.md) - Исправление ошибок аутентификации
- [PWA_UPDATE_MECHANISM.md](docs/PWA_UPDATE_MECHANISM.md) - Механизм обновления PWA
- [BELIOT_API_SPEC.md](docs/BELIOT_API_SPEC.md) - Спецификация Beliot API

## 💰 Стоимость использования

### Бесплатные сервисы (при небольшой нагрузке)
- **Supabase**: Free tier - 500MB база данных, 1GB хранилище, 50,000 месячных активных пользователей
- **Railway**: Free tier - $5 кредит/месяц
- **Google Apps Script**: Бесплатно (в рамках квот Google)

### Платные сервисы
- **Anthropic Claude API** (для AI-консультанта):
  - Модель: Claude Sonnet 4.5 (рекомендуется)
  - Стоимость: ~$0.003-0.015 за запрос (зависит от длины контекста)
  - Примерно: $5-10/месяц при умеренном использовании (50-100 запросов/день)
  - **Важно**: Оплата по модели Pay-as-you-go, отдельно от подписки claude.ai

### Оптимизация расходов
- Используйте кэширование ответов для частых запросов
- Ограничьте историю сообщений (MAX_HISTORY_FOR_API = 50)
- Мониторьте расходы в [console.anthropic.com](https://console.anthropic.com)

## 🚀 Развертывание

### Railway (рекомендуется)

#### Фронтенд (основное приложение)

1. Подключите репозиторий к Railway
2. Настройте переменные окружения:
   - `VITE_SUPABASE_URL` - URL проекта Supabase
   - `VITE_SUPABASE_ANON_KEY` - Anon key из Supabase
   - `VITE_SUPABASE_SERVICE_ROLE_KEY` - Service role key (для cron jobs)
   - `VITE_EQUIPMENT_API_URL` - URL Google Apps Script API
   - `VITE_BELIOT_API_BASE_URL` - URL Beliot API
   - `VITE_BELIOT_LOGIN` - Логин Beliot
   - `VITE_BELIOT_API_KEY` - API ключ Beliot
   - `VITE_AI_CONSULTANT_API_URL` - URL бэкенда AI-консультанта (см. ниже)
3. Railway автоматически обнаружит `Dockerfile` и выполнит сборку
4. Cron jobs настроены через `railway.json`

#### Бэкенд AI-консультанта (отдельный сервис)

1. **Создайте новый сервис** в Railway для бэкенда AI-консультанта
2. **Подключите тот же репозиторий**, но укажите root directory: `ai-consultant-api`
3. **Настройте переменные окружения**:
   - `SUPABASE_URL` - URL проекта Supabase
   - `SUPABASE_SERVICE_KEY` - Service role key (НЕ anon key!)
   - `ANTHROPIC_API_KEY` - API ключ с [console.anthropic.com](https://console.anthropic.com)
   - `GAS_API_URL` - URL Google Apps Script API
   - `ALLOWED_ORIGINS` - URL фронтенда (например: `https://your-app.railway.app`)
   - `PORT` - можно не указывать, Railway установит автоматически
4. Railway автоматически установит зависимости и запустит сервис
5. **Скопируйте URL** развернутого сервиса AI (например: `https://ai-consultant-api.railway.app`)
6. **Обновите переменную** `VITE_AI_CONSULTANT_API_URL` в фронтенд сервисе

#### Важные замечания для Railway

- **Два отдельных сервиса**: Фронтенд и AI-консультант должны быть развернуты как два независимых сервиса
- **CORS**: Убедитесь, что `ALLOWED_ORIGINS` в AI-консультанте содержит URL фронтенда
- **Service role key**: Используйте настоящий service_role key из Supabase (Settings → API)
- **Anthropic баланс**: Проверьте баланс на [console.anthropic.com](https://console.anthropic.com) перед деплоем
- **Health check**: После деплоя проверьте `https://your-ai-api.railway.app/health`

### Локальный сервер

См. [MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) для подробной инструкции по развертыванию на собственном сервере.

## 📄 Лицензия

Этот проект создан для внутреннего использования.

## 👥 Авторы

Проект разработан для управления оборудованием с использованием современных веб-технологий.

---

**Версия:** 2.0.0  
**Последнее обновление:** 2026  
**Архитектура:** Feature-based структура
