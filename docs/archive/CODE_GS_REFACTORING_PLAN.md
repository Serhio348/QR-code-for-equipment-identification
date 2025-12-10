# План рефакторинга Code.gs

## Текущее состояние

- **Размер файла:** 2280 строк
- **Количество функций:** ~35+ функций
- **Проблемы:**
  - Сложно навигироваться
  - Сложно поддерживать
  - Сложно тестировать отдельные модули
  - Все функции в одном файле

## Анализ структуры

### Текущие секции (по комментариям в коде):

1. **HTTP обработчики** (строки ~27-506)
   - `doOptions()` - CORS preflight
   - `doGet()` - GET запросы
   - `doPost()` - POST запросы

2. **Функции чтения данных** (строки ~508-633)
   - `getAllEquipment()`
   - `getEquipmentById(id)`
   - `getEquipmentByType(type)`

3. **Функции записи данных** (строки ~634-1059)
   - `addEquipment(data)`
   - `updateEquipment(id, data)`
   - `deleteEquipment(id)`
   - `deleteDriveFolder(folderUrl)`

4. **Вспомогательные функции** (строки ~1061-1335)
   - `getEquipmentSheet()`
   - `parseRowToEquipment(row, headers)`
   - `formatDate(dateValue)`
   - `generateId()`

5. **Функции работы с Google Drive** (строки ~1337-1545)
   - `createDriveFolder(equipmentName, parentFolderId)`
   - `getFolderFiles(folderUrlOrId)`

6. **Функции формирования ответов** (строки ~1547-1599)
   - `createJsonResponse(data)`
   - `createErrorResponse(message)`

7. **Тестовые функции** (строки ~1601-1787)
   - `testAddEquipment()`
   - `testCreateDriveFolder()`
   - `requestDrivePermissions()`
   - `testDeleteDriveFolder()`
   - `requestFullDrivePermissions()`

8. **Функции журнала обслуживания** (строки ~1789-2360)
   - `getMaintenanceLogSheet()`
   - `getMaintenanceLog(equipmentId)`
   - `_addMaintenanceEntry(equipmentId, entry)`
   - `_updateMaintenanceEntry(entryId, entry)`
   - `_deleteMaintenanceEntry(entryId)`
   - `syncMaintenanceEntryFile(equipment, entry)`
   - `getOrCreateEquipmentMaintenanceSheet(equipment)`
   - `buildMaintenanceSheetName(equipment)`
   - `setupMaintenanceSheetHeaders(sheet)`
   - `appendEntryToEquipmentMaintenanceSheet(sheet, entry)`
   - `updateEquipmentMaintenanceSheetInfo(equipmentId, sheetId, sheetUrl)`
   - `extractDriveIdFromUrl(urlOrId)`

## Предлагаемая структура модулей

### Преимущества разбиения в Google Apps Script:
- ✅ Все файлы .gs в одном проекте имеют общую область видимости
- ✅ Функции из разных файлов доступны везде
- ✅ Легче навигироваться по коду
- ✅ Легче поддерживать и тестировать
- ✅ Можно логически группировать функции

### Структура файлов:

```
backend/equipment-db/
├── Code.gs                    (главный файл - HTTP обработчики)
├── EquipmentQueries.gs         (чтение данных оборудования)
├── EquipmentMutations.gs        (создание, обновление, удаление)
├── MaintenanceLog.gs           (журнал обслуживания)
├── DriveOperations.gs           (операции с Google Drive)
├── SheetHelpers.gs             (работа с листами Google Sheets)
├── Utils.gs                    (утилиты: форматирование, ID, парсинг)
├── ResponseHelpers.gs          (формирование ответов API)
└── Tests.gs                    (тестовые функции)
```

## Детальный план разбиения

### 1. Code.gs (главный файл - HTTP обработчики)
**Размер:** ~480 строк

**Содержимое:**
- `doOptions(e)` - CORS preflight
- `doGet(e)` - маршрутизация GET запросов
- `doPost(e)` - маршрутизация POST запросов
- Логика парсинга запросов
- Вызов соответствующих функций из других модулей

**Зависимости:**
- EquipmentQueries.gs
- EquipmentMutations.gs
- MaintenanceLog.gs
- DriveOperations.gs
- ResponseHelpers.gs

---

### 2. EquipmentQueries.gs (чтение данных)
**Размер:** ~130 строк

**Содержимое:**
- `getAllEquipment()` - получить все оборудование
- `getEquipmentById(id)` - получить по ID
- `getEquipmentByType(type)` - получить по типу

**Зависимости:**
- SheetHelpers.gs (getEquipmentSheet, parseRowToEquipment)

---

### 3. EquipmentMutations.gs (изменение данных)
**Размер:** ~430 строк

**Содержимое:**
- `addEquipment(data)` - создать оборудование
- `updateEquipment(id, data)` - обновить оборудование
- `deleteEquipment(id)` - удалить оборудование
- `deleteDriveFolder(folderUrl)` - удалить папку Drive

**Зависимости:**
- SheetHelpers.gs
- DriveOperations.gs
- Utils.gs (generateId, formatDate)

---

### 4. MaintenanceLog.gs (журнал обслуживания)
**Размер:** ~570 строк

**Содержимое:**
- `getMaintenanceLogSheet()` - получить/создать лист журнала
- `getMaintenanceLog(equipmentId, maintenanceSheetId)` - получить записи
- `_addMaintenanceEntry(equipmentId, entry)` - добавить запись
- `_updateMaintenanceEntry(entryId, entry)` - обновить запись
- `_deleteMaintenanceEntry(entryId)` - удалить запись
- `syncMaintenanceEntryFile(equipment, entry)` - синхронизация с файлом
- `getOrCreateEquipmentMaintenanceSheet(equipment)` - получить/создать лист в папке
- `buildMaintenanceSheetName(equipment)` - имя листа
- `setupMaintenanceSheetHeaders(sheet)` - настройка заголовков
- `appendEntryToEquipmentMaintenanceSheet(sheet, entry)` - добавить запись в лист
- `updateEquipmentMaintenanceSheetInfo(equipmentId, sheetId, sheetUrl)` - обновить информацию

**Зависимости:**
- SheetHelpers.gs
- DriveOperations.gs
- Utils.gs

---

### 5. DriveOperations.gs (операции с Google Drive)
**Размер:** ~210 строк

**Содержимое:**
- `createDriveFolder(equipmentName, parentFolderId)` - создать папку
- `getFolderFiles(folderUrlOrId)` - получить файлы из папки
- `extractDriveIdFromUrl(urlOrId)` - извлечь ID из URL

**Зависимости:**
- Utils.gs (только для extractDriveIdFromUrl, если он там)

---

### 6. SheetHelpers.gs (работа с листами)
**Размер:** ~270 строк

**Содержимое:**
- `getEquipmentSheet()` - получить/создать лист "Оборудование"
- `parseRowToEquipment(row, headers)` - парсинг строки в объект
- Настройка заголовков и форматирования листов

**Зависимости:**
- Нет (базовые функции)

---

### 7. Utils.gs (утилиты)
**Размер:** ~90 строк

**Содержимое:**
- `formatDate(dateValue)` - форматирование даты
- `generateId()` - генерация UUID
- `extractDriveIdFromUrl(urlOrId)` - извлечение ID из URL (или в DriveOperations)

**Зависимости:**
- Нет (утилиты)

---

### 8. ResponseHelpers.gs (формирование ответов)
**Размер:** ~50 строк

**Содержимое:**
- `createJsonResponse(data)` - успешный ответ
- `createErrorResponse(message)` - ответ с ошибкой

**Зависимости:**
- Нет

---

### 9. Tests.gs (тестовые функции)
**Размер:** ~190 строк

**Содержимое:**
- `testAddEquipment()` - тест добавления
- `testCreateDriveFolder()` - тест создания папки
- `requestDrivePermissions()` - запрос прав
- `testDeleteDriveFolder()` - тест удаления
- `requestFullDrivePermissions()` - запрос полных прав

**Зависимости:**
- EquipmentMutations.gs
- DriveOperations.gs

---

## План миграции

### Этап 1: Подготовка
1. Создать новую структуру файлов в Google Apps Script
2. Скопировать весь Code.gs как резервную копию
3. Создать пустые файлы для каждого модуля

### Этап 2: Выделение утилит (Utils.gs, ResponseHelpers.gs)
1. Вынести `formatDate()`, `generateId()` в Utils.gs
2. Вынести `createJsonResponse()`, `createErrorResponse()` в ResponseHelpers.gs
3. Протестировать, что все работает

### Этап 3: Выделение работы с листами (SheetHelpers.gs)
1. Вынести `getEquipmentSheet()`, `parseRowToEquipment()` в SheetHelpers.gs
2. Обновить импорты в других модулях (если нужно)
3. Протестировать

### Этап 4: Выделение операций с Drive (DriveOperations.gs)
1. Вынести функции работы с Google Drive
2. Протестировать

### Этап 5: Выделение чтения данных (EquipmentQueries.gs)
1. Вынести функции чтения
2. Обновить doGet() для использования новых модулей
3. Протестировать

### Этап 6: Выделение изменения данных (EquipmentMutations.gs)
1. Вынести функции создания/обновления/удаления
2. Обновить doPost() для использования новых модулей
3. Протестировать

### Этап 7: Выделение журнала обслуживания (MaintenanceLog.gs)
1. Вынести все функции журнала
2. Обновить doPost() и doGet() для использования новых модулей
3. Протестировать

### Этап 8: Очистка Code.gs
1. Оставить только HTTP обработчики (doOptions, doGet, doPost)
2. Упростить логику маршрутизации
3. Удалить дублирующийся код

### Этап 9: Тесты (Tests.gs)
1. Вынести тестовые функции
2. Протестировать все функции

### Этап 10: Финальная проверка
1. Полное тестирование всех функций
2. Проверка работы API
3. Обновление документации

---

## Преимущества новой структуры

### Навигация
- ✅ Легко найти нужную функцию по названию файла
- ✅ Логическая группировка функций
- ✅ Меньше прокрутки для поиска

### Поддержка
- ✅ Легче добавлять новые функции в соответствующий модуль
- ✅ Легче исправлять баги (знаешь, где искать)
- ✅ Меньше конфликтов при совместной работе

### Тестирование
- ✅ Можно тестировать модули отдельно
- ✅ Легче изолировать проблемы
- ✅ Четкое разделение ответственности

### Масштабируемость
- ✅ Легко добавлять новые модули (например, Auth.gs для аутентификации)
- ✅ Легко расширять существующие модули
- ✅ Готовность к добавлению новых функций

---

## Рекомендации по именованию

### Соглашения:
- Имена файлов: `PascalCase.gs` (например, `EquipmentQueries.gs`)
- Имена функций: `camelCase` (например, `getAllEquipment()`)
- Приватные функции: `_camelCase` (например, `_addMaintenanceEntry()`)
- Константы: `UPPER_SNAKE_CASE` (если будут)

### Комментарии:
- Каждый файл должен начинаться с описания его назначения
- Каждая функция должна иметь JSDoc комментарий
- Разделители секций: `// ============================================================================`

---

## Дополнительные улучшения

### 1. Константы
Создать файл `Constants.gs`:
- Названия листов
- Названия колонок
- Коды ошибок
- Настройки (таймауты, лимиты)

### 2. Конфигурация
Создать файл `Config.gs`:
- ID таблицы
- ID корневой папки Drive
- Настройки приложения

### 3. Логирование
Создать файл `Logger.gs`:
- Унифицированные функции логирования
- Уровни логирования (DEBUG, INFO, ERROR)
- Форматирование логов

---

## Риски и митигация

### Риск 1: Потеря функций при миграции
**Митигация:**
- Сохранить резервную копию Code.gs
- Тестировать после каждого этапа
- Использовать версионный контроль

### Риск 2: Проблемы с областью видимости
**Митигация:**
- В Google Apps Script все функции глобальные
- Протестировать доступность функций между файлами

### Риск 3: Нарушение работы существующего API
**Митигация:**
- Полное тестирование всех endpoints
- Постепенная миграция
- Возможность отката

---

## Время реализации

**Оценка времени:**
- Этап 1-2: 30 минут (подготовка, утилиты)
- Этап 3-4: 1 час (листы, Drive)
- Этап 5-6: 1.5 часа (чтение, запись)
- Этап 7: 1 час (журнал)
- Этап 8-9: 1 час (очистка, тесты)
- Этап 10: 30 минут (финальная проверка)

**Итого:** ~5-6 часов работы

---

## Следующие шаги

1. ✅ Создать план (этот документ)
2. ⏳ Получить одобрение плана
3. ⏳ Начать миграцию по этапам
4. ⏳ Тестировать после каждого этапа
5. ⏳ Обновить документацию

---

## Примечания

- Все файлы .gs должны быть в одной папке проекта Google Apps Script
- Порядок файлов в редакторе не важен (все функции глобальные)
- Можно группировать файлы в папки (если редактор поддерживает)
- Рекомендуется добавить префикс к именам файлов для сортировки:
  - `01_Code.gs`
  - `02_EquipmentQueries.gs`
  - `03_EquipmentMutations.gs`
  - и т.д.

