# Структура проекта

## Текущая структура

```
QR-code-for-equipment-identification/
├── src/                          # Frontend (React приложение)
│   ├── components/
│   ├── pages/
│   ├── services/                 # API клиенты для работы с backend
│   ├── types/
│   └── utils/
├── google-sheets-setup/          # Backend для журнала обслуживания
│   ├── Code.gs
│   └── Index.html
└── docs/                         # Документация
```

## Предлагаемая структура после Фазы 1

```
QR-code-for-equipment-identification/
├── src/                          # Frontend (React приложение)
│   ├── components/
│   ├── pages/
│   ├── services/
│   │   ├── equipmentApi.ts      # Клиент для API оборудования
│   │   └── maintenanceApi.ts    # Клиент для API журнала (если нужно)
│   ├── types/
│   ├── utils/
│   └── config/
│       └── api.ts               # Конфигурация API URLs
│
├── backend/                      # Backend (Google Apps Script)
│   ├── equipment-db/             # API для базы данных оборудования
│   │   ├── Code.gs               # Основной код API
│   │   └── README.md             # Инструкции по развертыванию
│   │
│   └── maintenance-log/          # API для журнала обслуживания (существующий)
│       ├── Code.gs
│       └── Index.html
│
├── google-sheets-setup/          # (можно переименовать или оставить)
│   └── ...                      # Существующие файлы журнала
│
└── docs/                         # Документация
    ├── DEVELOPMENT_ROADMAP.md
    ├── PHASE1_IMPLEMENTATION_PLAN.md
    └── PROJECT_STRUCTURE.md
```

## Объяснение структуры

### Frontend (src/)
- React приложение
- Компоненты, страницы, сервисы
- Работает в браузере пользователя

### Backend (backend/)
- Google Apps Script проекты
- Каждый проект - отдельное веб-приложение
- Развертывается независимо
- Предоставляет REST API для frontend

### Почему отдельная папка?

1. **Разделение ответственности**
   - Frontend и Backend - разные технологии
   - Разные процессы развертывания
   - Разные настройки

2. **Независимое развертывание**
   - Google Apps Script развертывается через Google Cloud
   - React приложение развертывается отдельно (Vercel, Netlify и т.д.)

3. **Организация кода**
   - Легче найти нужные файлы
   - Понятная структура проекта
   - Удобно для команды

4. **Масштабируемость**
   - Легко добавить новые backend сервисы
   - Можно мигрировать на другой backend (Firebase, Supabase)
   - Frontend остается неизменным

## Альтернативная структура (если предпочитаете)

```
QR-code-for-equipment-identification/
├── frontend/                     # React приложение
│   └── src/
│
├── backend/                      # Google Apps Script
│   ├── equipment-api/
│   └── maintenance-api/
│
└── docs/
```

## Рекомендация

**Использовать структуру с папкой `backend/`**

Преимущества:
- ✅ Четкое разделение frontend/backend
- ✅ Легко найти backend код
- ✅ Удобно для документации
- ✅ Готово к масштабированию

## Файлы в backend/

### backend/equipment-db/Code.gs
```javascript
// Google Apps Script код для API базы данных оборудования
// Развертывается как отдельное веб-приложение
// Предоставляет REST API для работы с Google Sheets
```

### backend/equipment-db/README.md
```markdown
# API для базы данных оборудования

## Развертывание
1. Создайте Google Sheets таблицу
2. Откройте Apps Script
3. Скопируйте код из Code.gs
4. Опубликуйте как веб-приложение
5. Скопируйте URL в src/config/api.ts
```

## Связь Frontend и Backend

```
Frontend (React) 
    ↓ HTTP запросы
    ↓
Backend (Google Apps Script)
    ↓ API вызовы
    ↓
Google Sheets (База данных)
```

## Важно

- Google Apps Script код **не компилируется** вместе с React
- Каждый Google Apps Script проект развертывается **отдельно**
- URL веб-приложений хранятся в конфигурации frontend
- Backend код в репозитории - для версионирования и документации

