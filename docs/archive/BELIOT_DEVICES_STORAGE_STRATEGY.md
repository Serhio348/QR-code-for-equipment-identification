# Стратегия хранения данных по счетчикам Beliot

## Текущая ситуация

### Данные счетчиков
- **Источник данных**: Beliot API (`https://beliot.by:4443/api`)
- **Тип данных**: Устройства учета (metering devices)
- **Редактируемые поля**: 
  - Имя (`name`)
  - Место расположения (`address`)
  - Серийный номер (`serialNumber`)

### Проблема
- Данные редактируются только в памяти компонента (`useState`)
- При перезагрузке страницы все изменения теряются
- Нет синхронизации между устройствами
- Нет резервного копирования пользовательских данных

---

## Предлагаемая стратегия хранения

### Архитектура: Многоуровневое хранение данных

```
┌─────────────────────────────────────────────────────────┐
│                    Beliot API                            │
│              (Источник данных)                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Слой синхронизации                          │
│         (Merge Strategy Layer)                          │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│localStorage│  │IndexedDB │  │Google Sheets│
│  (Быстрый) │  │(Большие) │  │(Синхронизация)│
└──────────┘  └──────────┘  └──────────┘
```

---

## Уровень 1: localStorage (Быстрый доступ, локальное хранение)

### Назначение
- Хранение пользовательских изменений (overrides)
- Быстрый доступ к данным
- Работает офлайн

### Структура данных

```typescript
interface DeviceOverrides {
  [deviceId: string]: {
    name?: string;
    address?: string;
    serialNumber?: string;
    lastModified: number; // timestamp
  };
}

// Ключ в localStorage
const STORAGE_KEY = 'beliot_devices_overrides';
```

### Преимущества
- ✅ Простота реализации
- ✅ Быстрый доступ
- ✅ Работает офлайн
- ✅ Не требует сервера

### Ограничения
- ❌ Ограничение размера (~5-10 MB)
- ❌ Только для одного браузера/устройства
- ❌ Нет синхронизации между устройствами

### Использование
```typescript
// Сохранение
localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));

// Загрузка
const overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
```

---

## Уровень 2: IndexedDB (Для больших объемов данных)

### Назначение
- Хранение полных данных устройств (кэш)
- Хранение истории изменений
- Работа с большими объемами данных

### Структура данных

```typescript
interface DeviceCache {
  deviceId: string;
  deviceData: BeliotDevice;
  lastSync: number;
  version: number;
}

interface DeviceHistory {
  deviceId: string;
  field: 'name' | 'address' | 'serialNumber';
  oldValue: string;
  newValue: string;
  timestamp: number;
  userId?: string;
}
```

### Преимущества
- ✅ Большой объем данных (сотни MB)
- ✅ Структурированные запросы
- ✅ Индексация для быстрого поиска
- ✅ Работает офлайн

### Ограничения
- ❌ Более сложная реализация
- ❌ Только для одного браузера/устройства
- ❌ Нет синхронизации между устройствами

### Использование
```typescript
// Библиотека: idb (обертка над IndexedDB)
import { openDB } from 'idb';

const db = await openDB('beliot-devices-db', 1, {
  upgrade(db) {
    db.createObjectStore('devices', { keyPath: 'deviceId' });
    db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
  }
});
```

---

## Уровень 3: Google Sheets API (Синхронизация между устройствами)

### Назначение
- Синхронизация пользовательских изменений между устройствами
- Резервное копирование данных
- Совместная работа нескольких пользователей

### Структура таблицы

| deviceId | name | address | serialNumber | lastModified | modifiedBy |
|----------|------|---------|--------------|--------------|------------|
| 10596    | Новое имя | Новый адрес | 13001660 | 2024-01-15 10:30 | user@example.com |

### Преимущества
- ✅ Синхронизация между устройствами
- ✅ Резервное копирование
- ✅ История изменений
- ✅ Уже используется в проекте (Google Apps Script)

### Ограничения
- ❌ Требует интернет-соединение
- ❌ Может быть медленнее чем localStorage
- ❌ Ограничения API (квоты)

### Использование
```typescript
// Использование существующего Google Apps Script API
const response = await apiRequest('saveDeviceOverrides', 'POST', {
  deviceId: '10596',
  name: 'Новое имя',
  address: 'Новый адрес',
  serialNumber: '13001660'
});
```

---

## Стратегия слияния данных (Merge Strategy)

### Приоритет данных

```
1. Пользовательские изменения (overrides) - ВЫСШИЙ ПРИОРИТЕТ
   ↓
2. Данные из Google Sheets (синхронизация)
   ↓
3. Данные из Beliot API (исходные данные)
```

### Алгоритм слияния

```typescript
function mergeDeviceData(
  apiData: BeliotDevice,
  overrides: DeviceOverrides,
  syncedData?: DeviceOverrides
): BeliotDevice {
  const deviceId = String(apiData.device_id || apiData.id);
  const localOverrides = overrides[deviceId];
  const remoteOverrides = syncedData?.[deviceId];
  
  // Приоритет: локальные изменения > синхронизированные > API данные
  return {
    ...apiData,
    name: localOverrides?.name || remoteOverrides?.name || apiData.name,
    address: localOverrides?.address || remoteOverrides?.address || getAddressFromApi(apiData),
    // Серийный номер извлекается из name или берется из overrides
    serialNumber: localOverrides?.serialNumber || remoteOverrides?.serialNumber || extractSerialNumber(apiData.name),
  };
}
```

---

## Рекомендуемая реализация (Поэтапная)

### Этап 1: localStorage (Минимальная реализация) ⭐ РЕКОМЕНДУЕТСЯ

**Цель**: Сохранить пользовательские изменения между сессиями

**Реализация**:
1. Создать утилиту `src/utils/beliotStorage.ts`
2. Сохранять изменения в localStorage при редактировании
3. Загружать изменения при инициализации компонента
4. Применять изменения при отображении данных

**Время реализации**: 1-2 часа

**Файлы**:
- `src/utils/beliotStorage.ts` - утилиты для работы с localStorage
- `src/hooks/useBeliotDevicesStorage.ts` - React hook для управления данными

---

### Этап 2: Google Sheets синхронизация (Расширенная реализация) ⭐⭐

**Цель**: Синхронизация между устройствами

**Реализация**:
1. Расширить существующий Google Apps Script API
2. Добавить endpoints для сохранения/загрузки overrides
3. Реализовать периодическую синхронизацию
4. Добавить обработку конфликтов

**Время реализации**: 4-6 часов

**Файлы**:
- `backend/equipment-db/BeliotDevicesOverrides.gs` - новый модуль Google Apps Script
- `src/services/api/beliotDevicesStorageApi.ts` - API клиент

---

### Этап 3: IndexedDB (Продвинутая реализация) ⭐⭐⭐

**Цель**: Кэширование и история изменений

**Реализация**:
1. Установить библиотеку `idb`
2. Создать схему базы данных
3. Реализовать кэширование данных устройств
4. Добавить историю изменений

**Время реализации**: 6-8 часов

**Файлы**:
- `src/services/storage/beliotDevicesDB.ts` - работа с IndexedDB
- `src/hooks/useBeliotDevicesCache.ts` - кэширование данных

---

## Сравнение подходов

| Критерий | localStorage | IndexedDB | Google Sheets |
|----------|-------------|-----------|---------------|
| Простота | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Скорость | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Объем данных | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Синхронизация | ❌ | ❌ | ✅ |
| Офлайн | ✅ | ✅ | ❌ |
| История | ❌ | ✅ | ✅ |

---

## Рекомендация

**Для начала**: Реализовать **Этап 1 (localStorage)** - это быстро решит проблему потери данных при перезагрузке.

**В будущем**: Добавить **Этап 2 (Google Sheets)** для синхронизации между устройствами, если это необходимо.

**Этап 3 (IndexedDB)** - только если нужна история изменений или работа с очень большими объемами данных.

---

## Пример реализации (Этап 1)

См. файлы:
- `src/utils/beliotStorage.ts` - утилиты для работы с localStorage
- `src/hooks/useBeliotDevicesStorage.ts` - React hook

