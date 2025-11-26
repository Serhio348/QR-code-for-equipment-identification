# Структура проекта

## Текущая структура проекта

```
QR-code-for-equipment-identification/
├── src/                          # Frontend (React приложение)
│   ├── components/              # React компоненты
│   │   ├── EquipmentList.tsx    # Список оборудования
│   │   ├── EquipmentForm.tsx    # Форма добавления/редактирования
│   │   ├── EquipmentPlate.tsx   # Табличка оборудования
│   │   ├── DriveFilesList.tsx   # Список файлов из Google Drive
│   │   └── NotFoundPage.tsx     # Страница 404
│   │
│   ├── pages/                   # Страницы приложения
│   │   ├── HomePage.tsx         # Главная страница (список оборудования)
│   │   ├── EquipmentPage.tsx    # Страница просмотра оборудования
│   │   ├── EquipmentFormPage.tsx # Страница формы
│   │   └── NotFoundPage.tsx    # Страница 404
│   │
│   ├── services/                # API клиенты
│   │   └── equipmentApi.ts      # Клиент для работы с Google Apps Script API
│   │
│   ├── types/                   # TypeScript типы
│   │   └── equipment.ts         # Типы данных оборудования
│   │
│   ├── utils/                   # Утилиты
│   │   ├── routes.ts            # Управление маршрутами
│   │   ├── pdfExport.ts         # Экспорт в PDF
│   │   └── logger.ts            # Утилита для логирования
│   │
│   ├── config/                  # Конфигурация
│   │   └── api.ts               # URL API endpoints
│   │
│   ├── App.tsx                  # Главный компонент приложения
│   ├── main.tsx                 # Точка входа
│   └── vite-env.d.ts            # Типы Vite
│
├── backend/                     # Backend (Google Apps Script)
│   └── equipment-db/            # API для базы данных оборудования
│       ├── Code.gs              # Основной код API
│       ├── README.md            # Инструкции по развертыванию
│       └── UPDATE_INSTRUCTIONS.md # Инструкции по обновлению
│
├── docs/                        # Документация
│   ├── README.md               # Навигация по документации
│   ├── NEXT_STEPS_PLAN.md      # План дальнейшего развития
│   ├── PROJECT_STRUCTURE.md    # Этот файл
│   └── archive/                # Архив устаревших документов
│       ├── PHASE1_IMPLEMENTATION_PLAN.md
│       ├── DEVELOPMENT_ROADMAP.md
│       └── IMPLEMENTATION_EXAMPLES.md
│
├── README.md                    # Главный README
├── CORS_TROUBLESHOOTING.md      # Решение проблем с CORS
├── package.json                 # Зависимости проекта
├── tsconfig.json                # Конфигурация TypeScript
├── vite.config.ts               # Конфигурация Vite
└── .gitignore                   # Игнорируемые файлы
```

## Описание основных папок

### `src/` - Frontend приложение

#### `components/`
React компоненты для переиспользования:
- **EquipmentList** - отображение списка оборудования с фильтрацией
- **EquipmentForm** - форма для добавления и редактирования оборудования
- **EquipmentPlate** - табличка с характеристиками и QR-кодом
- **DriveFilesList** - список файлов из Google Drive

#### `pages/`
Страницы приложения (маршруты):
- **HomePage** - главная страница со списком оборудования
- **EquipmentPage** - страница просмотра конкретного оборудования
- **EquipmentFormPage** - страница формы (создание/редактирование)
- **NotFoundPage** - страница 404

#### `services/`
API клиенты для взаимодействия с backend:
- **equipmentApi.ts** - все функции для работы с API (CRUD операции)

#### `types/`
TypeScript определения типов:
- **equipment.ts** - типы для оборудования, характеристик, статусов

#### `utils/`
Вспомогательные утилиты:
- **routes.ts** - централизованное управление маршрутами
- **pdfExport.ts** - экспорт таблички в PDF
- **logger.ts** - утилита для условного логирования

#### `config/`
Конфигурационные файлы:
- **api.ts** - URL endpoints для API

### `backend/` - Backend (Google Apps Script)

#### `equipment-db/`
API для работы с базой данных оборудования:
- **Code.gs** - основной код Google Apps Script API
- **README.md** - подробные инструкции по развертыванию
- **UPDATE_INSTRUCTIONS.md** - инструкции по обновлению кода

### `docs/` - Документация

- **README.md** - навигация по документации
- **NEXT_STEPS_PLAN.md** - план дальнейшего развития
- **PROJECT_STRUCTURE.md** - описание структуры проекта
- **archive/** - архив устаревших документов

## Архитектура приложения

### Поток данных

```
Пользователь → React компонент → equipmentApi.ts → Google Apps Script → Google Sheets
                                                      ↓
                                                 Google Drive (папки)
```

### Маршрутизация

```
/ → HomePage (список оборудования)
/equipment/new → EquipmentFormPage (создание)
/equipment/:id → EquipmentPage (просмотр)
/equipment/:id/edit → EquipmentFormPage (редактирование)
* → NotFoundPage (404)
```

### Типы оборудования

Система поддерживает следующие типы:
- `filter` - Фильтры
- `pump` - Насосы
- `tank` - Резервуары
- `valve` - Клапаны
- `electrical` - Электрооборудование
- `ventilation` - Вентиляционное оборудование
- `plumbing` - Сантехническое оборудование
- `industrial` - Прочее промышленное оборудование
- `other` - Другое

## Технологический стек

### Frontend
- **React 18** - UI библиотека
- **TypeScript** - типизация
- **Vite** - сборщик и dev-сервер
- **React Router DOM** - маршрутизация
- **QRCode.react** - генерация QR-кодов
- **jsPDF + html2canvas** - экспорт в PDF

### Backend
- **Google Apps Script** - серверная логика
- **Google Sheets** - база данных
- **Google Drive API** - управление папками и файлами

## Следующие шаги

Для планов развития см. [NEXT_STEPS_PLAN.md](NEXT_STEPS_PLAN.md)
