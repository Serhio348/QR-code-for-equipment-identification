/**
 * beliotSerialExtractor.ts
 *
 * Извлекает заводской номер физического счётчика из ответа Beliot.
 *
 * Структура / что умеет:
 * 1. extractBeliotSerialNumber — проверяет явные поля, модель, properties и название
 */

// ============================================
// Типы и вспомогательные функции
// ============================================

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function firstString(object: JsonObject | null, keys: string[]): string | null {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

function extractSerialFromName(name: string | null): string | null {
  if (!name) return null;
  const labeled = name.match(/(?:№|SN|S\/N|заводской\s*№?)\s*[:#№-]?\s*(\d{6,})/iu);
  if (labeled?.[1]) return labeled[1];
  return name.match(/\b(\d{7,})\b/u)?.[1] ?? null;
}

// ============================================
// Публичный API
// ============================================

export function extractBeliotSerialNumber(raw: JsonObject): string | null {
  const serialKeys = [
    'serial_number',
    'serialNumber',
    'device_serial_number',
    'factory_number',
    'factoryNumber',
  ];
  return firstString(raw, serialKeys)
    ?? firstString(asObject(raw.model), serialKeys)
    ?? firstString(asObject(raw.properties), serialKeys)
    ?? extractSerialFromName(firstString(raw, ['name', 'device_name', 'title']));
}
