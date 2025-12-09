# Инструкция по обновлению Google Apps Script

## Проблема
Если вы видите ошибку "Неизвестное действие" при попытке собрать показания, это означает, что код в Google Apps Script не обновлен.

## Решение

### Шаг 1: Откройте Google Apps Script проект

1. Откройте вашу Google Sheets таблицу "База данных оборудования"
2. Перейдите: **Расширения → Apps Script**

### Шаг 2: Добавьте новый файл `DeviceReadings.gs`

1. В редакторе Apps Script нажмите **+** рядом с "Файлы"
2. Выберите **Скрипт**
3. Переименуйте файл в `DeviceReadings.gs`
4. Скопируйте весь код из файла `backend/equipment-db/DeviceReadings.gs` в этот файл
5. Сохраните (Ctrl+S)

### Шаг 3: Обновите файл `Code.gs`

1. Откройте файл `Code.gs`
2. Найдите секцию `case 'getLastDeviceReading':` (должна быть около строки 316)
3. Если её нет, добавьте следующий код в секцию `doGet` перед `case 'getBeliotDevicesOverrides':`:

```javascript
case 'getLastDeviceReading':
  // Получить последнее показание устройства
  Logger.log('📊 Обработка getLastDeviceReading (GET)');
  const lastDeviceId = e.parameter.deviceId;
  if (!lastDeviceId) {
    return createErrorResponse('ID устройства не указан');
  }
  const lastReading = getLastDeviceReading(lastDeviceId);
  return createJsonResponse(lastReading);

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
```

4. Найдите секцию `case 'deleteBeliotDeviceOverride':` в `doPost`
5. Добавьте перед `default:` следующие обработчики:

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
    deviceId: data.deviceId,
    readingValue: parseFloat(data.readingValue),
    unit: data.unit || 'м³',
    readingType: data.readingType || 'hourly',
    readingDate: data.readingDate ? parseInt(data.readingDate) : null,
    source: data.source || 'api'
  };
  return createJsonResponse(addDeviceReading(readingData));

case 'deleteDeviceReadings':
  // Удалить показания устройства за период
  Logger.log('📊 Обработка deleteDeviceReadings');
  if (!data.deviceId) {
    return createErrorResponse('deviceId не указан');
  }
  const deleteStartDate = data.startDate ? parseInt(data.startDate) : null;
  const deleteEndDate = data.endDate ? parseInt(data.endDate) : null;
  const deletedCount = deleteDeviceReadings(data.deviceId, deleteStartDate, deleteEndDate);
  return createJsonResponse({
    success: true,
    deletedCount: deletedCount,
    message: `Удалено показаний: ${deletedCount}`
  });
```

6. Обновите сообщения об ошибках в `default:` случаях, добавив новые действия:
   - В `doGet`: добавьте `getDeviceReadings, getLastDeviceReading`
   - В `doPost`: добавьте `addDeviceReading, deleteDeviceReadings`

### Шаг 4: Сохраните и разверните

1. Сохраните все файлы (Ctrl+S)
2. Перейдите: **Развернуть → Управление развертываниями**
3. Нажмите на карандаш ✏️ рядом с существующим развертыванием
4. Убедитесь, что "У кого есть доступ" = **"Все"** ⚠️
5. Нажмите **Развернуть** (версия обновится автоматически)

### Шаг 5: Проверьте работу

1. Обновите страницу приложения в браузере (Ctrl+F5)
2. Попробуйте собрать показания снова

## Важно

- Убедитесь, что файл `DeviceReadings.gs` добавлен в проект Apps Script
- Все функции из `DeviceReadings.gs` должны быть доступны глобально
- После обновления может потребоваться несколько секунд, чтобы изменения вступили в силу

## Проверка

Если после обновления ошибка сохраняется:

1. Откройте консоль браузера (F12)
2. Проверьте точный URL запроса
3. Убедитесь, что параметр `action=getLastDeviceReading` присутствует в URL
4. Проверьте логи в Apps Script: **Выполнение → Просмотр журналов выполнения**

