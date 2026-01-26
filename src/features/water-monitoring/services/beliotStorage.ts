/**
 * Утилиты для хранения пользовательских изменений данных счетчиков Beliot
 * 
 * Использует localStorage для персистентного хранения пользовательских изменений
 * (имя, место расположения, серийный номер)
 */

const STORAGE_KEY = 'beliot_devices_overrides';

export interface DeviceOverrides {
  [deviceId: string]: {
    name?: string;
    address?: string;
    serialNumber?: string;
    object?: string; // Объект (под объектом основного меню)
    lastModified: number; // timestamp
  };
}

/**
 * Загружает пользовательские изменения из localStorage
 * 
 * @returns {DeviceOverrides} Объект с изменениями по deviceId
 */
export function loadDeviceOverrides(): DeviceOverrides {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }
    return JSON.parse(stored) as DeviceOverrides;
  } catch (error) {
    console.error('Ошибка загрузки данных из localStorage:', error);
    return {};
  }
}

/**
 * Сохраняет пользовательские изменения в localStorage
 * 
 * @param {DeviceOverrides} overrides - Объект с изменениями
 */
export function saveDeviceOverrides(overrides: DeviceOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error('Ошибка сохранения данных в localStorage:', error);
    // Если превышен лимит localStorage, пытаемся очистить старые данные
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Превышен лимит localStorage, очищаем старые данные...');
      clearOldOverrides();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } catch (retryError) {
        console.error('Не удалось сохранить данные даже после очистки:', retryError);
      }
    }
  }
}

/**
 * Обновляет изменения для конкретного устройства
 * 
 * @param {string} deviceId - ID устройства
 * @param {Partial<DeviceOverrides[string]>} updates - Обновления
 */
export function updateDeviceOverride(
  deviceId: string,
  updates: Partial<DeviceOverrides[string]>
): void {
  const overrides = loadDeviceOverrides();
  const id = String(deviceId);
  
  overrides[id] = {
    ...overrides[id],
    ...updates,
    lastModified: Date.now(),
  };
  
  saveDeviceOverrides(overrides);
}

/**
 * Удаляет изменения для конкретного устройства
 * 
 * @param {string} deviceId - ID устройства
 */
export function removeDeviceOverride(deviceId: string): void {
  const overrides = loadDeviceOverrides();
  const id = String(deviceId);
  
  delete overrides[id];
  saveDeviceOverrides(overrides);
}

/**
 * Очищает все изменения
 */
export function clearAllOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Ошибка очистки localStorage:', error);
  }
}

/**
 * Очищает старые изменения (старше 90 дней)
 */
function clearOldOverrides(): void {
  const overrides = loadDeviceOverrides();
  const now = Date.now();
  const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 дней в миллисекундах
  
  const filtered: DeviceOverrides = {};
  
  for (const [deviceId, override] of Object.entries(overrides)) {
    if (override.lastModified && (now - override.lastModified) < maxAge) {
      filtered[deviceId] = override;
    }
  }
  
  saveDeviceOverrides(filtered);
}

/**
 * Получает изменения для конкретного устройства
 * 
 * @param {string} deviceId - ID устройства
 * @returns {DeviceOverrides[string] | undefined} Изменения или undefined
 */
export function getDeviceOverride(deviceId: string): DeviceOverrides[string] | undefined {
  const overrides = loadDeviceOverrides();
  return overrides[String(deviceId)];
}

/**
 * Проверяет, есть ли изменения для устройства
 * 
 * @param {string} deviceId - ID устройства
 * @returns {boolean} true если есть изменения
 */
export function hasDeviceOverride(deviceId: string): boolean {
  const override = getDeviceOverride(deviceId);
  return override !== undefined && (
    override.name !== undefined ||
    override.address !== undefined ||
    override.serialNumber !== undefined ||
    override.object !== undefined
  );
}

/**
 * Экспортирует все изменения в JSON строку (для резервного копирования)
 * 
 * @returns {string} JSON строка с изменениями
 */
export function exportOverrides(): string {
  const overrides = loadDeviceOverrides();
  return JSON.stringify(overrides, null, 2);
}

/**
 * Импортирует изменения из JSON строки (для восстановления из резервной копии)
 * 
 * @param {string} jsonString - JSON строка с изменениями
 * @returns {boolean} true если импорт успешен
 */
export function importOverrides(jsonString: string): boolean {
  try {
    const overrides = JSON.parse(jsonString) as DeviceOverrides;
    
    // Валидация структуры
    if (typeof overrides !== 'object' || overrides === null) {
      throw new Error('Неверный формат данных');
    }
    
    // Объединяем с существующими данными
    const existing = loadDeviceOverrides();
    const merged: DeviceOverrides = {
      ...existing,
      ...overrides,
    };
    
    saveDeviceOverrides(merged);
    return true;
  } catch (error) {
    console.error('Ошибка импорта данных:', error);
    return false;
  }
}

