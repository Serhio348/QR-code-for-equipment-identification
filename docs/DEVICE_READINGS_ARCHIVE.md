# Архив показаний счетчиков Beliot

## Описание

Система автоматического сбора и хранения показаний счетчиков Beliot в Google Sheets для создания локального архива данных.

## Архитектура

### 1. Сбор данных
- **Источник:** Beliot API (`getDeviceReadings`)
- **Частота:** Почасовая или ежедневная (в 00:00)
- **Метод:** Автоматический запрос текущих показаний каждого устройства

### 2. Хранение данных
- **База данных:** Google Sheets
- **Лист:** "Показания счетчиков"
- **Структура:**
  - `deviceId` - ID устройства из Beliot API
  - `readingDate` - Дата снятия показания (Unix timestamp)
  - `readingValue` - Значение показания
  - `unit` - Единица измерения (м³, кВт и т.д.)
  - `readingType` - Тип показания (`hourly` или `daily`)
  - `createdAt` - Дата создания записи (Unix timestamp)
  - `source` - Источник данных (`api` или `manual`)

### 3. Отображение данных
- **Источник:** Google Sheets (локальный архив)
- **Интерфейс:** Панель быстрого доступа с фильтрами по периоду и типу показаний

## Использование

### Автоматический сбор показаний

```typescript
import { collectDeviceReadings } from './services/api/deviceReadingsCollector';
import { getCompanyDevices } from './services/api/beliotDeviceApi';

// Получить все устройства
const devices = await getCompanyDevices();

// Собрать показания для всех устройств (почасовые)
const result = await collectDeviceReadings({
  devices,
  readingType: 'hourly',
  force: false // Не перезаписывать существующие показания
});

console.log(`Успешно: ${result.success}, Ошибок: ${result.failed}`);
```

### Ручной сбор показаний для одного устройства

```typescript
import { collectSingleDeviceReading } from './services/api/deviceReadingsCollector';

const result = await collectSingleDeviceReading('11018', 'hourly', false);
if (result.success) {
  console.log('Показание сохранено');
} else {
  console.error('Ошибка:', result.error);
}
```

### Получение архива показаний

```typescript
import { getDeviceReadings } from './services/api/deviceReadingsApi';

// Получить показания за период
const readings = await getDeviceReadings({
  deviceId: '11018',
  startDate: Math.floor(new Date('2025-12-01').getTime() / 1000),
  endDate: Math.floor(new Date('2025-12-08').getTime() / 1000),
  readingType: 'hourly' // или 'daily' или 'all'
});

console.log(`Найдено показаний: ${readings.length}`);
```

## Настройка автоматического сбора

### Вариант 1: Google Apps Script триггер

Создайте функцию в Google Apps Script для автоматического сбора показаний:

```javascript
function collectReadingsHourly() {
  // Эта функция будет вызываться каждый час
  // Здесь нужно вызвать API для сбора показаний
  // Можно использовать UrlFetchApp для вызова вашего API
}
```

Настройте триггер:
1. В Google Apps Script: **Триггеры → Добавить триггер**
2. Выберите функцию: `collectReadingsHourly`
3. Источник события: **По времени**
4. Тип триггера: **Каждый час**

### Вариант 2: Cron Job (внешний сервер)

Настройте cron job на вашем сервере для вызова API сбора показаний:

```bash
# Каждый час
0 * * * * curl -X POST https://your-api.com/api/collect-readings

# Ежедневно в 00:00
0 0 * * * curl -X POST https://your-api.com/api/collect-readings?type=daily
```

## Преимущества подхода

1. **Независимость от Beliot API** - данные хранятся локально
2. **Быстрый доступ** - чтение из Google Sheets быстрее, чем запросы к API
3. **Гибкость** - можно добавлять ручные показания
4. **Надежность** - данные сохраняются даже при сбоях API
5. **Простота** - не нужно создавать сложные отчеты через Beliot API

## Ограничения

1. **Хранение** - Google Sheets имеет ограничение на количество строк (5 миллионов)
2. **Производительность** - при большом количестве устройств сбор может занять время
3. **Синхронизация** - нужно следить за актуальностью данных

## Рекомендации

1. Начните с почасового сбора для критичных устройств
2. Для менее важных устройств можно использовать ежедневный сбор
3. Регулярно проверяйте логи на наличие ошибок
4. Рассмотрите возможность архивирования старых данных (старше года)

