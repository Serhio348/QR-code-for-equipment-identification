/**
 * beliotClient.ts
 *
 * Серверный HTTP-клиент Beliot: авторизация и полный список устройств.
 *
 * Структура / что умеет:
 * 1. login — получает и кэширует Bearer token
 * 2. fetchAllDevices — читает все страницы metering_devices
 * 3. fallbackAbonentDevices — использует abonent/main/data при недоступности основного endpoint
 */

import { config } from '../../../config/env.js';
import type { BeliotProviderDevice } from './beliotTypes.js';

// ============================================
// Вспомогательные функции
// ============================================

type JsonObject = Record<string, unknown>;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function nested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function firstString(object: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

export function extractDevicesFromResponse(payload: unknown): JsonObject[] {
  const candidates = [
    nested(payload, ['data', 'data', 'metering_devices', 'data']),
    nested(payload, ['data', 'metering_devices', 'data']),
    nested(payload, ['data', 'devices_list']),
    nested(payload, ['data', 'devices']),
    nested(payload, ['devices']),
    nested(payload, ['data']),
    payload,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(asObject).filter((item): item is JsonObject => item !== null);
    }
  }
  return [];
}

function normalizeDevice(raw: JsonObject): BeliotProviderDevice | null {
  const deviceId = firstString(raw, ['device_id', 'id', '_id']);
  if (!deviceId) return null;

  const model = asObject(raw.model);
  return {
    deviceId,
    name: firstString(raw, ['name', 'device_name', 'title']),
    serialNumber: firstString(raw, ['serial_number', 'serialNumber'])
      ?? (model ? firstString(model, ['serial_number', 'serialNumber']) : null),
    address: firstString(raw, ['address', 'installation_address']),
    objectName: firstString(raw, ['object_name', 'facility_name', 'object']),
    providerData: raw,
  };
}

async function postBeliot(endpoint: string, body: JsonObject, token?: string): Promise<unknown> {
  const baseUrl = config.beliotApiBaseUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/${endpoint.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.beliotApiTimeout),
  });

  if (!response.ok) {
    throw new Error(`Beliot ${endpoint}: HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

// ============================================
// Публичный API
// ============================================

export async function login(): Promise<string> {
  if (cachedToken && tokenExpiresAt > Date.now() + 300_000) return cachedToken;
  if (!config.beliotLogin || !config.beliotPassword) {
    throw new Error('Beliot не настроен: нужны BELIOT_LOGIN и BELIOT_PASSWORD');
  }

  const payload = await postBeliot('auth/login', {
    email: config.beliotLogin,
    password: config.beliotPassword,
    personal_data_access: true,
  });
  const token = [
    nested(payload, ['token']),
    nested(payload, ['access_token']),
    nested(payload, ['bearer_token']),
    nested(payload, ['data', 'token']),
    nested(payload, ['data', 'access_token']),
    nested(payload, ['data', 'bearer_token']),
  ].find((value): value is string => typeof value === 'string' && value.length > 0);

  if (!token) throw new Error('Beliot не вернул токен авторизации');
  cachedToken = token;
  tokenExpiresAt = Date.now() + 3_600_000;
  return token;
}

export async function fetchAllDevices(): Promise<BeliotProviderDevice[]> {
  const token = await login();
  const devices = new Map<string, BeliotProviderDevice>();
  const perPage = 100;
  let firstPageFailed = false;

  for (let page = 1; page <= 200; page += 1) {
    try {
      const payload = await postBeliot('device/metering_devices', {
        paginate: true,
        page,
        per_page: perPage,
      }, token);
      const rows = extractDevicesFromResponse(payload);
      if (rows.length === 0) break;
      for (const row of rows) {
        const device = normalizeDevice(row);
        if (device) devices.set(device.deviceId, device);
      }
      if (rows.length < perPage) break;
    } catch (error) {
      if (page === 1) firstPageFailed = true;
      else console.warn(`[Beliot] Страница ${page} пропущена:`, error);
      break;
    }
  }

  if (devices.size > 0) return [...devices.values()];
  if (!firstPageFailed) return [];

  const fallback = await postBeliot('abonent/main/data', {}, token);
  return extractDevicesFromResponse(fallback)
    .map(normalizeDevice)
    .filter((device): device is BeliotProviderDevice => device !== null);
}
