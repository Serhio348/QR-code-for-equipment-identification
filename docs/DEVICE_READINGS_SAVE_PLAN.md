# План сохранения текущих показаний счётчиков

## 📋 Обзор

План реализации системы автоматического сохранения текущих показаний счётчиков из Beliot API в Google Sheets для создания локального архива данных.

---

## 🎯 Цели

1. **Автоматический сбор** текущих показаний из Beliot API
2. **Сохранение в Google Sheets** для создания локального архива
3. **Предотвращение дубликатов** - не сохранять показания за один и тот же период времени
   - ⚠️ **Важно:** Проверяем только по времени, НЕ по значению!
   - Даже если расход = 0 (показание не изменилось), это новое показание, которое нужно сохранить
   - Это позволяет отслеживать периоды без расхода
4. **Автоматизация** - полностью автоматический сбор через Google Apps Script триггер
5. **Надёжность** - обработка ошибок и логирование

---

## 🏗️ Архитектура

### 1. Структура данных

#### Google Sheets - Лист "Показания счетчиков"

| Колонка | Название | Тип | Описание |
|---------|----------|-----|----------|
| A | deviceId | String | ID устройства из Beliot API (например, "11018") |
| B | readingDate | Number | Дата снятия показания (Unix timestamp в секундах) |
| C | readingValue | Number | Значение показания (например, 5401.37) |
| D | unit | String | Единица измерения (м³, кВт и т.д.) |
| E | readingType | String | Тип показания: `hourly` (почасовой) или `daily` (ежедневный) |
| F | createdAt | Number | Дата создания записи в архиве (Unix timestamp) |
| G | source | String | Источник данных: всегда `api` (из Beliot API) |
| H | period | String | Период показания: `current` (текущее) или `previous` (предыдущее) |

**Заголовки (строка 1):**
```
deviceId | readingDate | readingValue | unit | readingType | createdAt | source | period
```

---

### 2. Backend (Google Apps Script)

#### Новый модуль: `DeviceReadings.gs`

**Функции:**

1. **`getDeviceReadingsSheet()`**
   - Получить или создать лист "Показания счетчиков"
   - Настроить заголовки, если лист новый
   - Вернуть объект Sheet

2. **`addDeviceReading(readingData)`**
   - Добавить показание в лист
   - Проверить на дубликаты (по deviceId + readingDate + readingType)
   - Вернуть результат (успех/ошибка)

3. **`getDeviceReadings(deviceId, startDate, endDate, readingType)`**
   - Получить показания устройства за период
   - Фильтровать по типу показания (hourly/daily/all)
   - Вернуть массив показаний

4. **`getLastDeviceReading(deviceId)`**
   - Получить последнее показание устройства
   - Вернуть объект показания или null

5. **`checkReadingExists(deviceId, readingDate, readingType)`**
   - Проверить, существует ли показание за этот период
   - Проверяет только по времени и типу, НЕ по значению
   - Используется для предотвращения дубликатов
   - **Важно:** Даже если значение не изменилось, но время другое - это НЕ дубликат!

**Структура `readingData`:**
```javascript
{
  deviceId: string,        // Обязательно
  readingValue: number,    // Обязательно
  unit: string,           // По умолчанию "м³"
  readingType: string,     // "hourly" или "daily", по умолчанию "hourly"
  readingDate: number,     // Unix timestamp, по умолчанию текущее время
  source: string,          // Всегда "api" (автоматический сбор)
  period: string           // "current" или "previous", по умолчанию "current"
}
```

#### Обновление `Code.gs`

**Добавить в `doPost`:**
```javascript
case 'addDeviceReading':
  // Добавить показание счетчика
  Logger.log('📊 Обработка addDeviceReading');
  if (!data.deviceId) {
    return createErrorResponse('deviceId не указан');
  }
  if (data.readingValue === undefined || data.readingValue === null) {
    return createErrorResponse('readingValue не указан');
  }
  const readingData = {
    deviceId: String(data.deviceId),
    readingValue: parseFloat(data.readingValue),
    unit: data.unit || 'м³',
    readingType: data.readingType || 'hourly',
    readingDate: data.readingDate ? parseInt(data.readingDate) : Math.floor(Date.now() / 1000),
    source: data.source || 'api',
    period: data.period || 'current'
  };
  const result = addDeviceReading(readingData);
  return createJsonResponse(result);
```

**Добавить в `doGet`:**
```javascript
case 'getDeviceReadings':
  // Получить показания устройства за период
  Logger.log('📊 Обработка getDeviceReadings (GET)');
  const getDeviceId = e.parameter.deviceId;
  if (!getDeviceId) {
    return createErrorResponse('ID устройства не указан');
  }
  const getStartDate = e.parameter.startDate ? parseInt(e.parameter.startDate) : null;
  const getEndDate = e.parameter.endDate ? parseInt(e.parameter.endDate) : null;
  const getReadingType = e.parameter.readingType || 'all';
  const readings = getDeviceReadings(getDeviceId, getStartDate, getEndDate, getReadingType);
  return createJsonResponse(readings);

case 'getLastDeviceReading':
  // Получить последнее показание устройства
  Logger.log('📊 Обработка getLastDeviceReading (GET)');
  const lastDeviceId = e.parameter.deviceId;
  if (!lastDeviceId) {
    return createErrorResponse('ID устройства не указан');
  }
  const lastReading = getLastDeviceReading(lastDeviceId);
  return createJsonResponse(lastReading);
```

---

### 3. Frontend (React/TypeScript)

#### Новый файл: `src/services/api/deviceReadingsApi.ts`

**Функции:**

1. **`saveDeviceReading(readingData)`**
   - Сохранить показание через Google Apps Script API
   - Обработать ошибки

2. **`getDeviceReadings(options)`**
   - Получить показания за период
   - Параметры: deviceId, startDate, endDate, readingType

3. **`getLastDeviceReading(deviceId)`**
   - Получить последнее показание устройства

**Интерфейсы:**
```typescript
interface DeviceReading {
  id?: number;              // ID строки в Google Sheets
  deviceId: string;
  readingDate: number;      // Unix timestamp
  readingValue: number;
  unit: string;
  readingType: 'hourly' | 'daily';
  createdAt: number;        // Unix timestamp
  source: 'api';          // Всегда "api" (автоматический сбор)
  period: 'current' | 'previous';
}

interface SaveReadingData {
  deviceId: string;
  readingValue: number;
  unit?: string;
  readingType?: 'hourly' | 'daily';
  readingDate?: number;
  source?: 'api';         // Всегда "api" (автоматический сбор)
  period?: 'current' | 'previous';
}
```

#### Примечание о Collector

**Важно:** Сбор показаний происходит полностью автоматически в Google Apps Script через триггер. Файл `deviceReadingsCollector.ts` не обязателен для основной функциональности.

Если нужен для тестирования или отладки, можно создать упрощённую версию, но основная логика будет в Google Apps Script.

---

## 🔄 Процесс сбора данных

### Шаг 1: Получение текущих показаний

```typescript
// Используем существующую функцию getDeviceReadings из beliotDeviceApi.ts
const readings = await getDeviceReadings(deviceId);
// readings.current содержит текущее показание
```

### Шаг 2: Проверка на дубликаты

**Важно:** Проверяем только по времени и типу, НЕ по значению! Даже если расход = 0 (показание не изменилось), это всё равно новое показание, которое нужно сохранить.

```typescript
// Проверяем, есть ли уже показание за этот период
const lastReading = await getLastDeviceReading(deviceId);
if (lastReading && !force) {
  // Проверяем, не является ли это дубликатом по времени
  // НЕ проверяем readingValue - значение может не измениться, но это новое показание!
  
  if (readingType === 'hourly') {
    // Для почасовых: проверяем, есть ли показание за тот же час
    const currentHour = Math.floor(currentReading.readingDate / 3600) * 3600;
    const lastHour = Math.floor(lastReading.readingDate / 3600) * 3600;
    
    if (currentHour === lastHour) {
      // Показание за этот час уже есть
      return { success: false, reason: 'duplicate', message: 'Показание за этот час уже сохранено' };
    }
  } else if (readingType === 'daily') {
    // Для ежедневных: проверяем, есть ли показание за тот же день
    const currentDay = Math.floor(currentReading.readingDate / 86400) * 86400;
    const lastDay = Math.floor(lastReading.readingDate / 86400) * 86400;
    
    if (currentDay === lastDay) {
      // Показание за этот день уже есть
      return { success: false, reason: 'duplicate', message: 'Показание за этот день уже сохранено' };
    }
  }
}

// Если не дубликат - сохраняем, даже если значение не изменилось
// Это важно для отслеживания периодов без расхода!
```

### Шаг 3: Сохранение в Google Sheets

```typescript
const result = await saveDeviceReading({
  deviceId: deviceId,
  readingValue: readings.current.value,
  unit: readings.current.unit || 'м³',
  readingType: 'hourly',
  readingDate: Math.floor(new Date(readings.current.date).getTime() / 1000),
  source: 'api',
  period: 'current'
});
```

---

## ⚙️ Автоматизация сбора

### Google Apps Script триггер (единственный вариант)

**Преимущества:**
- Не требует внешнего сервера
- Бесплатно
- Простая настройка
- Надёжно
- Полностью автоматический

**Реализация:**

1. Создать функцию в Google Apps Script:
```javascript
function collectReadingsHourly() {
  Logger.log('🔄 Начало автоматического сбора показаний...');
  
  try {
    // Получить список всех устройств из Beliot API
    // Для каждого устройства:
    //   1. Получить текущее показание через Beliot API
    //   2. Проверить на дубликаты
    //   3. Сохранить в Google Sheets через addDeviceReading
    
    const devices = getBeliotDevices(); // Список устройств
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      try {
        // Получаем показание из Beliot API
        const reading = getBeliotDeviceReading(device.device_id);
        
        if (reading && reading.current) {
          // Сохраняем в Google Sheets
          const result = addDeviceReading({
            deviceId: device.device_id,
            readingValue: reading.current.value,
            unit: reading.current.unit || 'м³',
            readingType: 'hourly',
            readingDate: Math.floor(new Date(reading.current.date).getTime() / 1000),
            source: 'api',
            period: 'current'
          });
          
          if (result.success) {
            successCount++;
          } else if (result.reason === 'duplicate') {
            // Дубликат - это нормально, не считаем ошибкой
            Logger.log(`⚠️ Показание для устройства ${device.device_id} уже существует (дубликат)`);
          } else {
            errorCount++;
            Logger.log(`❌ Ошибка сохранения для устройства ${device.device_id}: ${result.message}`);
          }
        }
      } catch (error) {
        errorCount++;
        Logger.log(`❌ Ошибка для устройства ${device.device_id}: ${error.toString()}`);
      }
    }
    
    Logger.log(`✅ Сбор завершён. Успешно: ${successCount}, Ошибок: ${errorCount}`);
  } catch (error) {
    Logger.log(`❌ Критическая ошибка при сборе показаний: ${error.toString()}`);
  }
}
```

2. Настроить триггер:
   - **Триггеры → Добавить триггер**
   - Функция: `collectReadingsHourly`
   - Источник события: **По времени**
   - Тип триггера: **Каждый час**
   - Время: `00:00` (начало часа)

**Ограничения:**
- Google Apps Script имеет лимит времени выполнения (6 минут)
- Максимум 20,000 вызовов API в день
- Для большого количества устройств может потребоваться оптимизация (батчинг, параллельная обработка)

**Альтернатива: Внешний сервер (Cron Job)**

Если Google Apps Script не подходит из-за ограничений:

**Преимущества:**
- Полный контроль
- Нет ограничений Google Apps Script
- Можно использовать более мощные серверы

**Реализация:**

1. Создать API endpoint для сбора показаний
2. Настроить cron job:
```bash
# Каждый час
0 * * * * curl -X POST https://your-api.com/api/collect-readings
```

**Недостатки:**
- Требует внешний сервер
- Дополнительные расходы

---

## 📊 Рекомендуемая частота сбора

### Почасовой сбор (`hourly`)
- **Когда:** Каждый час в начале часа (00:00, 01:00, ...)
- **Для:** Критичных устройств, требующих детального мониторинга
- **Объём данных:** ~24 записи в день на устройство

### Ежедневный сбор (`daily`)
- **Когда:** Один раз в день (обычно в 00:00)
- **Для:** Менее критичных устройств
- **Объём данных:** 1 запись в день на устройство

---

## 🔍 Проверка на дубликаты

### ⚠️ Важно: Логика проверки

**Ключевой принцип:** Проверяем только по **времени** и **типу показания**, **НЕ по значению**!

**Почему это важно:**
- Если расход = 0 (показание не изменилось), это всё равно **новое показание**, которое нужно сохранить
- Это позволяет отслеживать периоды без расхода
- Показывает, что система работала, но расхода не было

### Логика проверки:

1. **Для почасовых показаний (`hourly`):**
   - Проверяем, есть ли показание за тот же час
   - Вычисляем начало часа: `Math.floor(readingDate / 3600) * 3600`
   - Если начало часа совпадает с существующим показанием - это дубликат
   - **Пример:**
     - Существующее: `readingDate = 1704067200` (2024-01-01 10:00:00) → час = `1704067200`
     - Новое: `readingDate = 1704067300` (2024-01-01 10:01:40) → час = `1704067200` → **дубликат**
     - Новое: `readingDate = 1704070800` (2024-01-01 11:00:00) → час = `1704070800` → **не дубликат**

2. **Для ежедневных показаний (`daily`):**
   - Проверяем, есть ли показание за тот же день
   - Вычисляем начало дня: `Math.floor(readingDate / 86400) * 86400`
   - Если начало дня совпадает с существующим показанием - это дубликат
   - **Пример:**
     - Существующее: `readingDate = 1704067200` (2024-01-01 00:00:00) → день = `1704067200`
     - Новое: `readingDate = 1704153600` (2024-01-02 00:00:00) → день = `1704153600` → **не дубликат**

3. **Параметр `force`:**
   - Если `force: true` - пропускаем проверку и сохраняем в любом случае
   - Используется для принудительного сохранения или перезаписи

### Что НЕ проверяется:

❌ **НЕ проверяем `readingValue`** - значение может не измениться, но это новое показание!
- Сценарий: Счётчик показывает `5401.37` в 10:00 и `5401.37` в 11:00
- Результат: Оба показания сохраняются (расход = 0, но это важная информация)

### Реализация в коде:

**Backend (`DeviceReadings.gs`):**
```javascript
function checkReadingExists(deviceId, readingDate, readingType) {
  const sheet = getDeviceReadingsSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return false;
  
  // Читаем только последние N записей для этого устройства (оптимизация)
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues(); // deviceId, readingDate, readingValue, unit, readingType
  
  // Фильтруем по deviceId и readingType
  const deviceReadings = data.filter(row => 
    String(row[0]) === String(deviceId) && row[4] === readingType
  );
  
  if (deviceReadings.length === 0) return false;
  
  // Проверяем по времени (в зависимости от типа)
  if (readingType === 'hourly') {
    const currentHour = Math.floor(readingDate / 3600) * 3600;
    return deviceReadings.some(row => {
      const rowHour = Math.floor(row[1] / 3600) * 3600;
      return rowHour === currentHour;
    });
  } else if (readingType === 'daily') {
    const currentDay = Math.floor(readingDate / 86400) * 86400;
    return deviceReadings.some(row => {
      const rowDay = Math.floor(row[1] / 86400) * 86400;
      return rowDay === currentDay;
    });
  }
  
  return false;
}
```

**Frontend (`deviceReadingsCollector.ts`):**
```typescript
async function collectDeviceReading(
  deviceId: string,
  readingType: 'hourly' | 'daily',
  force: boolean = false
): Promise<{ success: boolean; reason?: string; message?: string }> {
  try {
    // Получаем текущее показание из Beliot API
    const readings = await getDeviceReadings(deviceId);
    
    if (!readings.current) {
      return { success: false, reason: 'no_reading', message: 'Показание не найдено' };
    }
    
    const readingDate = Math.floor(new Date(readings.current.date).getTime() / 1000);
    
    // Проверяем на дубликаты (только если не force)
    if (!force) {
      const lastReading = await getLastDeviceReading(deviceId);
      
      if (lastReading) {
        if (readingType === 'hourly') {
          const currentHour = Math.floor(readingDate / 3600) * 3600;
          const lastHour = Math.floor(lastReading.readingDate / 3600) * 3600;
          
          if (currentHour === lastHour) {
            return {
              success: false,
              reason: 'duplicate',
              message: 'Показание за этот час уже сохранено'
            };
          }
        } else if (readingType === 'daily') {
          const currentDay = Math.floor(readingDate / 86400) * 86400;
          const lastDay = Math.floor(lastReading.readingDate / 86400) * 86400;
          
          if (currentDay === lastDay) {
            return {
              success: false,
              reason: 'duplicate',
              message: 'Показание за этот день уже сохранено'
            };
          }
        }
      }
    }
    
    // Сохраняем показание (даже если значение не изменилось!)
    await saveDeviceReading({
      deviceId: deviceId,
      readingValue: readings.current.value,
      unit: readings.current.unit || 'м³',
      readingType: readingType,
      readingDate: readingDate,
      source: 'api',
      period: 'current'
    });
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      reason: 'error',
      message: error.message || 'Ошибка при сохранении показания'
    };
  }
}
```

### Примеры сценариев:

**Сценарий 1: Расход = 0 (показание не изменилось)**
- 10:00 - показание: `5401.37 м³`
- 11:00 - показание: `5401.37 м³` (расход = 0)
- **Результат:** Оба показания сохраняются ✅
- **Причина:** Разное время = разные показания, даже если значение одинаковое

**Сценарий 2: Дубликат (тот же час)**
- 10:00 - показание: `5401.37 м³` (уже сохранено)
- 10:15 - показание: `5402.50 м³` (попытка сохранить)
- **Результат:** Второе показание не сохраняется (дубликат) ❌
- **Причина:** Оба показания в одном часе

**Сценарий 3: Разные часы, одинаковое значение**
- 10:00 - показание: `5401.37 м³`
- 11:00 - показание: `5401.37 м³`
- **Результат:** Оба показания сохраняются ✅
- **Причина:** Разные часы = разные показания

---

## 📝 Примеры использования

### Сохранение текущего показания

```typescript
import { getDeviceReadings } from './services/api/beliotDeviceApi';
import { saveDeviceReading } from './services/api/deviceReadingsApi';

// Получить текущее показание
const readings = await getDeviceReadings('11018');

if (readings.current) {
  // Сохранить в Google Sheets
  await saveDeviceReading({
    deviceId: '11018',
    readingValue: readings.current.value,
    unit: readings.current.unit || 'м³',
    readingType: 'hourly',
    readingDate: Math.floor(new Date(readings.current.date).getTime() / 1000),
    source: 'api',
    period: 'current'
  });
}
```

### Автоматический сбор показаний (Google Apps Script)

**Примечание:** Сбор происходит автоматически через Google Apps Script триггер. Этот пример показывает, как работает функция сбора внутри триггера:

```javascript
// В Google Apps Script (collectReadingsHourly)
function collectReadingsHourly() {
  // Получить список всех устройств
  const devices = getBeliotDevices();
  
  // Собрать показания для всех устройств
  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    try {
      // Получаем показание из Beliot API
      const reading = getBeliotDeviceReading(device.device_id);
      
      if (reading && reading.current) {
        // Сохраняем в Google Sheets
        const result = addDeviceReading({
          deviceId: device.device_id,
          readingValue: reading.current.value,
          unit: reading.current.unit || 'м³',
          readingType: 'hourly',
          readingDate: Math.floor(new Date(reading.current.date).getTime() / 1000),
          source: 'api',
          period: 'current'
        });
        
        if (result.success) {
          Logger.log(`✅ Показание для устройства ${device.device_id} сохранено`);
        } else if (result.reason === 'duplicate') {
          Logger.log(`⚠️ Показание для устройства ${device.device_id} уже существует`);
        }
      }
    } catch (error) {
      Logger.log(`❌ Ошибка для устройства ${device.device_id}: ${error.toString()}`);
    }
  }
}
```

### Получение архива показаний

```typescript
import { getDeviceReadings } from './services/api/deviceReadingsApi';

// Получить показания за период
const startDate = Math.floor(new Date('2025-01-01').getTime() / 1000);
const endDate = Math.floor(new Date('2025-01-31').getTime() / 1000);

const readings = await getDeviceReadings({
  deviceId: '11018',
  startDate: startDate,
  endDate: endDate,
  readingType: 'hourly'
});

console.log(`Найдено показаний: ${readings.length}`);
```

---

## 🚀 План реализации

### Этап 1: Backend (Google Apps Script)
- [ ] Создать модуль `DeviceReadings.gs`
- [ ] Реализовать функции работы с листом
- [ ] Добавить обработчики в `Code.gs`
- [ ] Протестировать сохранение и получение данных

### Этап 2: Frontend API
- [ ] Создать `deviceReadingsApi.ts`
- [ ] Реализовать функции сохранения и получения
- [ ] Добавить обработку ошибок

### Этап 3: Автоматический сбор (Google Apps Script)
- [ ] Создать функцию `collectReadingsHourly()` в Google Apps Script
- [ ] Реализовать логику получения показаний из Beliot API
- [ ] Добавить проверку на дубликаты
- [ ] Реализовать обработку ошибок и логирование

### Этап 4: UI для просмотра данных (опционально)
- [ ] Добавить отображение сохранённых показаний в `BeliotDevicesTest.tsx`
- [ ] Реализовать пагинацию для просмотра данных
- [ ] Добавить фильтры по периоду и устройству

### Этап 5: Настройка триггера
- [ ] Настроить триггер Google Apps Script на каждый час
- [ ] Протестировать автоматический сбор
- [ ] Настроить мониторинг и логирование

### Этап 6: Оптимизация производительности (критично!)
- [ ] Реализовать пагинацию данных (limit/offset)
- [ ] Добавить сортировку при сохранении (по readingDate DESC)
- [ ] Реализовать кэширование последних показаний
- [ ] Добавить фильтрацию с ограничением диапазона строк
- [ ] Реализовать архивирование старых данных (через 6 месяцев)
- [ ] Оптимизировать UI с виртуализацией списка (опционально)
- [ ] Протестировать производительность с большим объёмом данных

---

## ⚠️ Важные замечания

1. **Ограничения Google Sheets:**
   - Максимум 5 миллионов строк на лист
   - При большом объёме данных может потребоваться архивирование старых данных

2. **Производительность:**
   - Для большого количества устройств используйте параллельную обработку с ограничением
   - Рекомендуется не более 5-10 одновременных запросов к Beliot API

3. **Обработка ошибок:**
   - Всегда обрабатывайте ошибки API
   - Логируйте неудачные попытки сохранения
   - Не прерывайте сбор при ошибке одного устройства

4. **Безопасность:**
   - Google Apps Script API должен быть защищён
   - Проверяйте права доступа перед сохранением данных

---

## 🚀 Оптимизация производительности для больших объёмов данных

### Проблема производительности

При заполнении Google Sheets на 50% и более, выгрузка данных для просмотра может значительно увеличить время загрузки. Это критично для пользовательского опыта.

### Решения для оптимизации

#### 1. Пагинация данных (обязательно)

**Проблема:** Загрузка всех данных сразу замедляет работу.

**Решение:** Реализовать пагинацию на уровне API.

**Backend (`DeviceReadings.gs`):**
```javascript
function getDeviceReadings(deviceId, startDate, endDate, readingType, options) {
  options = options || {};
  const limit = options.limit || 100;        // По умолчанию 100 записей
  const offset = options.offset || 0;        // Смещение для пагинации
  const sortBy = options.sortBy || 'readingDate'; // Сортировка
  const sortOrder = options.sortOrder || 'desc';  // Порядок: desc (новые сначала) или asc
  
  const sheet = getDeviceReadingsSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    return {
      data: [],
      total: 0,
      limit: limit,
      offset: offset,
      hasMore: false
    };
  }
  
  // Получаем все данные (фильтруем в памяти для точности)
  const allData = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  
  // Фильтруем данные
  let filtered = allData.filter((row, index) => {
    const rowDeviceId = String(row[0]);
    const rowDate = row[1];
    const rowType = row[4];
    
    // Фильтр по deviceId
    if (deviceId && rowDeviceId !== String(deviceId)) return false;
    
    // Фильтр по дате
    if (startDate && rowDate < startDate) return false;
    if (endDate && rowDate > endDate) return false;
    
    // Фильтр по типу
    if (readingType && readingType !== 'all' && rowType !== readingType) return false;
    
    return true;
  });
  
  // Сортировка
  filtered.sort((a, b) => {
    const aValue = a[1]; // readingDate
    const bValue = b[1];
    return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
  });
  
  // Применяем пагинацию
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);
  
  // Преобразуем в объекты
  const result = paginated.map((row, index) => ({
    id: offset + index + 2, // +2 потому что строка 1 - заголовки, индексация с 0
    deviceId: String(row[0]),
    readingDate: row[1],
    readingValue: row[2],
    unit: row[3],
    readingType: row[4],
    createdAt: row[5],
    source: row[6],
    period: row[7]
  }));
  
  return {
    data: result,
    total: total,
    limit: limit,
    offset: offset,
    hasMore: (offset + limit) < total
  };
}
```

**Frontend (`deviceReadingsApi.ts`):**
```typescript
interface GetReadingsOptions {
  deviceId?: string;
  startDate?: number;
  endDate?: number;
  readingType?: 'hourly' | 'daily' | 'all';
  limit?: number;        // Количество записей на странице
  offset?: number;       // Смещение для пагинации
  sortBy?: string;       // Поле для сортировки
  sortOrder?: 'asc' | 'desc';
}

interface GetReadingsResponse {
  data: DeviceReading[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function getDeviceReadings(
  options: GetReadingsOptions = {}
): Promise<GetReadingsResponse> {
  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  url.searchParams.append('action', 'getDeviceReadings');
  
  if (options.deviceId) {
    url.searchParams.append('deviceId', options.deviceId);
  }
  if (options.startDate) {
    url.searchParams.append('startDate', options.startDate.toString());
  }
  if (options.endDate) {
    url.searchParams.append('endDate', options.endDate.toString());
  }
  if (options.readingType) {
    url.searchParams.append('readingType', options.readingType);
  }
  if (options.limit) {
    url.searchParams.append('limit', options.limit.toString());
  }
  if (options.offset) {
    url.searchParams.append('offset', options.offset.toString());
  }
  if (options.sortBy) {
    url.searchParams.append('sortBy', options.sortBy);
  }
  if (options.sortOrder) {
    url.searchParams.append('sortOrder', options.sortOrder);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}
```

**Использование в UI:**
```typescript
const [readings, setReadings] = useState<DeviceReading[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(0);
const [loading, setLoading] = useState(false);
const pageSize = 100;

const loadReadings = async (pageNum: number) => {
  setLoading(true);
  try {
    const result = await getDeviceReadings({
      deviceId: selectedDeviceId,
      startDate: startDate,
      endDate: endDate,
      limit: pageSize,
      offset: pageNum * pageSize,
      sortOrder: 'desc'
    });
    
    setReadings(result.data);
    setTotal(result.total);
    setPage(pageNum);
  } finally {
    setLoading(false);
  }
};
```

#### 2. Индексация данных (сортировка при сохранении)

**Проблема:** Поиск по несортированным данным медленный.

**Решение:** Всегда сохранять данные в отсортированном виде (по readingDate DESC).

**Backend (`DeviceReadings.gs`):**
```javascript
function addDeviceReading(readingData) {
  const sheet = getDeviceReadingsSheet();
  const lastRow = sheet.getLastRow();
  
  // Находим правильную позицию для вставки (сортировка по readingDate DESC)
  let insertRow = 2; // После заголовков
  
  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Только deviceId и readingDate
    const newDate = readingData.readingDate;
    
    // Ищем позицию, где readingDate больше нового (для DESC сортировки)
    for (let i = 0; i < data.length; i++) {
      if (data[i][1] < newDate) { // readingDate в колонке B (индекс 1)
        insertRow = i + 2; // +2 потому что строка 1 - заголовки, индексация с 0
        break;
      }
    }
    
    if (insertRow === 2 && data.length > 0 && data[0][1] >= newDate) {
      insertRow = lastRow + 1; // Вставляем в конец, если новое значение меньше всех
    }
  }
  
  // Вставляем строку
  sheet.insertRowBefore(insertRow);
  
  // Заполняем данные
  const row = [
    readingData.deviceId,
    readingData.readingDate,
    readingData.readingValue,
    readingData.unit || 'м³',
    readingData.readingType || 'hourly',
    readingData.createdAt || Math.floor(Date.now() / 1000),
    readingData.source || 'api',
    readingData.period || 'current'
  ];
  
  sheet.getRange(insertRow, 1, 1, 8).setValues([row]);
  
  return { success: true, row: insertRow };
}
```

#### 3. Кэширование последних показаний

**Проблема:** Частые запросы последних показаний нагружают систему.

**Решение:** Кэшировать последние показания для каждого устройства.

**Backend (`DeviceReadings.gs`):**
```javascript
// Кэш в памяти (сбрасывается при перезапуске скрипта)
var lastReadingsCache = {};

function getLastDeviceReading(deviceId) {
  // Проверяем кэш (если есть)
  const cacheKey = String(deviceId);
  if (lastReadingsCache[cacheKey]) {
    const cached = lastReadingsCache[cacheKey];
    // Кэш действителен 5 минут
    if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }
  }
  
  // Получаем из листа (только первые 100 строк, т.к. данные отсортированы)
  const sheet = getDeviceReadingsSheet();
  const lastRow = Math.min(sheet.getLastRow(), 101); // Заголовок + 100 строк
  
  if (lastRow < 2) {
    return null;
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  
  // Ищем последнее показание для устройства (данные отсортированы DESC)
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(deviceId)) {
      const result = {
        id: i + 2,
        deviceId: String(data[i][0]),
        readingDate: data[i][1],
        readingValue: data[i][2],
        unit: data[i][3],
        readingType: data[i][4],
        createdAt: data[i][5],
        source: data[i][6],
        period: data[i][7]
      };
      
      // Сохраняем в кэш
      lastReadingsCache[cacheKey] = {
        data: result,
        timestamp: Date.now()
      };
      
      return result;
    }
  }
  
  return null;
}
```

#### 4. Фильтрация на стороне сервера с ограничением диапазона

**Проблема:** Чтение всех данных из листа медленное.

**Решение:** Читать только нужный диапазон строк.

**Backend (`DeviceReadings.gs`):**
```javascript
function getDeviceReadingsOptimized(deviceId, startDate, endDate, readingType, options) {
  options = options || {};
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  
  const sheet = getDeviceReadingsSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    return { data: [], total: 0, limit: limit, offset: offset, hasMore: false };
  }
  
  // Если указан период, пытаемся найти примерный диапазон строк
  // Это работает только если данные отсортированы по readingDate DESC
  let startRow = 2;
  let endRow = lastRow;
  
  if (endDate) {
    // Ищем первую строку с readingDate <= endDate (бинарный поиск)
    // Упрощённая версия: читаем первые N строк и ищем
    const sampleSize = Math.min(1000, lastRow - 1);
    const sample = sheet.getRange(2, 1, sampleSize, 2).getValues();
    
    for (let i = 0; i < sample.length; i++) {
      if (sample[i][1] <= endDate) {
        startRow = i + 2;
        break;
      }
    }
  }
  
  if (startDate) {
    // Аналогично ищем последнюю строку с readingDate >= startDate
    // Читаем с конца
    const sampleSize = Math.min(1000, lastRow - startRow);
    if (sampleSize > 0) {
      const sample = sheet.getRange(Math.max(2, lastRow - sampleSize + 1), 1, sampleSize, 2).getValues();
      
      for (let i = sample.length - 1; i >= 0; i--) {
        if (sample[i][1] >= startDate) {
          endRow = lastRow - sampleSize + i + 1;
          break;
        }
      }
    }
  }
  
  // Читаем только нужный диапазон
  const rangeSize = endRow - startRow + 1;
  if (rangeSize <= 0) {
    return { data: [], total: 0, limit: limit, offset: offset, hasMore: false };
  }
  
  const data = sheet.getRange(startRow, 1, rangeSize, 8).getValues();
  
  // Фильтруем
  let filtered = data.filter((row) => {
    if (deviceId && String(row[0]) !== String(deviceId)) return false;
    if (startDate && row[1] < startDate) return false;
    if (endDate && row[1] > endDate) return false;
    if (readingType && readingType !== 'all' && row[4] !== readingType) return false;
    return true;
  });
  
  // Сортируем и применяем пагинацию
  filtered.sort((a, b) => b[1] - a[1]); // DESC по readingDate
  
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);
  
  const result = paginated.map((row, index) => ({
    id: startRow + offset + index,
    deviceId: String(row[0]),
    readingDate: row[1],
    readingValue: row[2],
    unit: row[3],
    readingType: row[4],
    createdAt: row[5],
    source: row[6],
    period: row[7]
  }));
  
  return {
    data: result,
    total: total,
    limit: limit,
    offset: offset,
    hasMore: (offset + limit) < total
  };
}
```

#### 5. Архивирование старых данных

**Проблема:** Большое количество старых данных замедляет работу.

**Решение:** Перемещать старые данные (старше N месяцев) в отдельный лист "Архив показаний".

**Backend (`DeviceReadings.gs`):**
```javascript
function archiveOldReadings(monthsToKeep = 6) {
  const sheet = getDeviceReadingsSheet();
  const archiveSheet = getArchiveReadingsSheet(); // Отдельный лист для архива
  
  const cutoffDate = Math.floor(Date.now() / 1000) - (monthsToKeep * 30 * 24 * 60 * 60);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return { archived: 0 };
  
  // Находим строки для архивации (данные отсортированы DESC, старые в конце)
  let archiveStartRow = lastRow + 1;
  
  for (let row = 2; row <= lastRow; row++) {
    const readingDate = sheet.getRange(row, 2).getValue(); // readingDate в колонке B
    if (readingDate < cutoffDate) {
      archiveStartRow = row;
      break;
    }
  }
  
  if (archiveStartRow > lastRow) {
    return { archived: 0 }; // Нет данных для архивации
  }
  
  // Копируем старые данные в архив
  const archiveRange = sheet.getRange(archiveStartRow, 1, lastRow - archiveStartRow + 1, 8);
  const archiveData = archiveRange.getValues();
  
  // Добавляем в архив
  const archiveLastRow = archiveSheet.getLastRow();
  if (archiveLastRow === 0) {
    // Создаём заголовки
    archiveSheet.getRange(1, 1, 1, 8).setValues([[
      'deviceId', 'readingDate', 'readingValue', 'unit', 'readingType', 'createdAt', 'source', 'period'
    ]]);
  }
  
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveData.length, 8).setValues(archiveData);
  
  // Удаляем из основного листа
  sheet.deleteRows(archiveStartRow, lastRow - archiveStartRow + 1);
  
  return { archived: lastRow - archiveStartRow + 1 };
}

function getArchiveReadingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Архив показаний');
  
  if (!sheet) {
    sheet = ss.insertSheet('Архив показаний');
    // Настраиваем заголовки
    sheet.getRange(1, 1, 1, 8).setValues([[
      'deviceId', 'readingDate', 'readingValue', 'unit', 'readingType', 'createdAt', 'source', 'period'
    ]]);
    // Делаем заголовки жирными
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }
  
  return sheet;
}
```

**Автоматическое архивирование (триггер):**
```javascript
function archiveOldReadingsMonthly() {
  // Запускать раз в месяц
  const result = archiveOldReadings(6); // Хранить 6 месяцев в основном листе
  Logger.log(`Архивировано показаний: ${result.archived}`);
}
```

#### 6. Использование нескольких листов по периодам

**Альтернативное решение:** Разделить данные по листам (по месяцам или годам).

**Структура:**
- "Показания 2025-01"
- "Показания 2025-02"
- и т.д.

**Преимущества:**
- Быстрый доступ к данным за конкретный период
- Меньше данных в каждом листе

**Недостатки:**
- Сложнее запросы, которые охватывают несколько периодов
- Больше листов для управления

#### 7. Оптимизация UI - виртуализация списка

**Проблема:** Рендеринг большого количества строк в таблице медленный.

**Решение:** Использовать виртуализацию (отображать только видимые строки).

**Библиотека:** `react-window` или `react-virtualized`

```typescript
import { FixedSizeList } from 'react-window';

// В компоненте
<FixedSizeList
  height={600}
  itemCount={readings.length}
  itemSize={50}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      {/* Рендерим строку таблицы */}
      <ReadingRow reading={readings[index]} />
    </div>
  )}
</FixedSizeList>
```

### Рекомендации по применению

**Обязательно:**
1. ✅ Пагинация данных (limit/offset)
2. ✅ Сортировка при сохранении (по readingDate DESC)
3. ✅ Кэширование последних показаний

**Желательно:**
4. ✅ Фильтрация с ограничением диапазона
5. ✅ Архивирование старых данных (через 6 месяцев)

**Опционально:**
6. ⚪ Разделение по листам (если данных очень много)
7. ⚪ Виртуализация списка в UI

### Ожидаемый эффект

- **Без оптимизации:** Загрузка 10,000 записей = 5-10 секунд
- **С пагинацией (100 записей):** Загрузка = 0.5-1 секунда
- **С кэшированием последних:** Запрос последнего показания = < 0.1 секунды
- **С архивированием:** Основной лист всегда содержит актуальные данные

---

## 📈 Метрики и мониторинг

### Что отслеживать:

1. **Количество сохранённых показаний:**
   - Успешно сохранено за период
   - Ошибки сохранения

2. **Производительность:**
   - Время сбора показаний для всех устройств
   - Количество дубликатов (пропущенных записей)

3. **Качество данных:**
   - Пропуски в данных (отсутствие показаний за период)
   - Аномальные значения (резкие скачки)

---

## 🔗 Связанные документы

- `docs/DEVICE_READINGS_ARCHIVE.md` - Архитектура архива показаний
- `docs/DATA_COLLECTION_SOURCE.md` - Источник данных для сбора
- `src/services/api/beliotDeviceApi.ts` - API для получения показаний из Beliot

---

## ✅ Чеклист перед запуском

- [ ] Модуль `DeviceReadings.gs` создан и протестирован
- [ ] Обработчики добавлены в `Code.gs`
- [ ] Frontend API функции реализованы
- [ ] Collector реализован и протестирован
- [ ] UI для просмотра сохранённых показаний добавлен (опционально)
- [ ] Автоматический сбор настроен (если используется)
- [ ] **Пагинация данных реализована (обязательно!)**
- [ ] **Сортировка при сохранении реализована (обязательно!)**
- [ ] **Кэширование последних показаний реализовано (обязательно!)**
- [ ] Обработка ошибок реализована
- [ ] Логирование настроено
- [ ] Документация обновлена
- [ ] Протестирована производительность с большим объёмом данных

