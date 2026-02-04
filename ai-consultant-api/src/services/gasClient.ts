/**
 * gasClient.ts
 *
 * HTTP-клиент для взаимодействия с Google Apps Script (GAS) Web App.
 *
 * GAS Web App — это REST API, развёрнутое на Google Apps Script,
 * которое работает как прокси к Google Sheets (база оборудования)
 * и Google Drive (файлы, паспорта, инструкции).
 *
 * Схема взаимодействия:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  ai-consultant-api (Node.js)                                 │
 * │       ↓ gasClient.get / gasClient.post                       │
 * │  HTTP запрос к GAS Web App                                   │
 * │       ↓                                                      │
 * │  Google Apps Script (серверный JavaScript на Google Cloud)    │
 * │       ↓ doGet / doPost обработчики                           │
 * │  Google Sheets API / Google Drive API                        │
 * │       ↓                                                      │
 * │  JSON ответ: { success: true, data: {...} }                 │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Возможности:
 * - Таймаут запросов (AbortSignal.timeout)
 * - Retry с exponential backoff для 5xx ошибок
 * - Валидация URL при инициализации
 * - Два уровня обработки ошибок (HTTP + бизнес-логика)
 *
 * Файл экспортирует:
 * - gasClient — singleton экземпляр GasClient
 */

import { config } from '../config/env.js';

// ============================================
// Типы
// ============================================

/**
 * Стандартный формат ответа от GAS Web App.
 *
 * Все GAS обработчики возвращают ответ через функцию createJsonResponse(),
 * которая оборачивает данные в этот формат:
 *
 * Успех:  { success: true,  data: { ... } }
 * Ошибка: { success: false, error: "описание ошибки" }
 *
 * @template T - Тип данных в поле data (зависит от action)
 */
interface GasResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================
// GAS HTTP-клиент
// ============================================

/**
 * HTTP-клиент для Google Apps Script API.
 *
 * Инкапсулирует:
 * - Формирование URL с query parameters (GET)
 * - Отправку JSON body (POST)
 * - Разбор ответа и извлечение data из обёртки GasResponse
 * - Таймауты, retry при 5xx, валидацию URL
 *
 * Используется в:
 * - equipmentTools.ts — запросы к оборудованию (getAll, getById и др.)
 * - driveTools.ts — работа с Google Drive (getFolderFiles, getFileContent)
 */
class GasClient {
    /** URL деплоймента GAS Web App (из .env → config.gasApiUrl) */
    private baseUrl: string;

    /** Таймаут запросов в мс (из .env → config.gasApiTimeout, по умолчанию 30000) */
    private timeout: number;

    /** Количество повторных попыток при 5xx ошибках (из .env → config.gasApiRetryCount) */
    private retryCount: number;

    constructor() {
        this.baseUrl = config.gasApiUrl;
        this.timeout = config.gasApiTimeout;
        this.retryCount = config.gasApiRetryCount;

        // Валидация URL при создании экземпляра.
        // Ловит опечатки в .env на этапе запуска, а не при первом запросе
        if (this.baseUrl) {
            try {
                new URL(this.baseUrl);
            } catch {
                throw new Error(`Invalid GAS API URL: ${this.baseUrl}`);
            }
        }
    }

    // ----------------------------------------
    // Внутренний метод: fetch с retry
    // ----------------------------------------

    /**
     * Выполняет HTTP запрос с retry при серверных ошибках (5xx).
     *
     * Стратегия retry:
     * - Retry ТОЛЬКО при 5xx (серверные ошибки GAS)
     * - НЕ ретраим таймауты (AbortError) — GAS скорее всего перегружен
     * - НЕ ретраим бизнес-ошибки (success: false) — повтор не поможет
     * - Exponential backoff: 1s, 2s, 4s между попытками
     *
     * @param url - URL запроса
     * @param options - параметры fetch (method, headers, body)
     * @returns Распарсенные данные из GAS ответа
     */
    private async fetchWithRetry<T>(
        url: string,
        options: RequestInit,
        action: string
    ): Promise<T> {
        const baseDelay = 1000;

        for (let attempt = 0; attempt <= this.retryCount; attempt++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: AbortSignal.timeout(this.timeout),
                });

                // 5xx — серверная ошибка GAS, можно попробовать ещё раз
                if (!response.ok && response.status >= 500 && attempt < this.retryCount) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(
                        `[GasClient] ${action} HTTP ${response.status}, retry ${attempt + 1}/${this.retryCount} in ${delay}ms`
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // 4xx или финальная 5xx попытка — выбрасываем ошибку
                if (!response.ok) {
                    throw new Error(
                        `GAS API ${action}: HTTP ${response.status} ${response.statusText}`
                    );
                }

                // Парсим JSON и проверяем бизнес-логику
                const json = await response.json() as GasResponse<T>;

                if (!json.success) {
                    throw new Error(json.error || `GAS API ${action}: unknown error`);
                }

                return json.data as T;

            } catch (error) {
                // Таймаут — не ретраим, сразу выбрасываем с понятным сообщением
                if (error instanceof DOMException && error.name === 'TimeoutError') {
                    throw new Error(
                        `GAS API ${action}: timeout after ${this.timeout}ms`
                    );
                }

                // Последняя попытка — пробрасываем ошибку
                if (attempt === this.retryCount) {
                    throw error;
                }

                // Сетевая ошибка (нет интернета, DNS и т.д.) — ретраим
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(
                    `[GasClient] ${action} attempt ${attempt + 1} failed, retry in ${delay}ms:`,
                    error instanceof Error ? error.message : error
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Недостижимо, но TypeScript требует return
        throw new Error(`GAS API ${action}: max retries exceeded`);
    }

    // ----------------------------------------
    // Публичные методы
    // ----------------------------------------

    /**
     * GET запрос к GAS API.
     *
     * Используется для операций чтения (не изменяют данные).
     * Параметры передаются как URL query string.
     *
     * Формат запроса:
     *   GET {baseUrl}?action={action}&param1=val1&param2=val2
     *
     * @template T - Тип возвращаемых данных
     * @param action - Имя GAS action (getAll, getById, getMaintenanceLog, getFolderFiles, getFileContent)
     * @param params - Дополнительные параметры (undefined значения пропускаются)
     * @returns Данные из поля data ответа GAS
     * @throws Error если HTTP ошибка, таймаут или success === false
     *
     * @example
     * const equipment = await gasClient.get('getAll', { search: 'фильтр' });
     */
    async get<T>(action: string, params?: Record<string, string | undefined>): Promise<T> {
        // Формируем URL с query parameters
        const url = new URL(this.baseUrl);
        url.searchParams.append('action', action);

        // Добавляем параметры, пропуская undefined
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    url.searchParams.append(key, value);
                }
            });
        }

        return this.fetchWithRetry<T>(url.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        }, action);
    }

    /**
     * POST запрос к GAS API.
     *
     * Используется для операций записи (изменяют данные).
     * action и данные передаются в теле JSON.
     *
     * Формат запроса:
     *   POST {baseUrl}
     *   Body: { "action": "addMaintenanceEntry", ...data }
     *
     * @template T - Тип возвращаемых данных
     * @param action - Имя GAS action (addMaintenanceEntry)
     * @param data - Данные для записи
     * @returns Данные из поля data ответа GAS
     * @throws Error если HTTP ошибка, таймаут или success === false
     *
     * @example
     * const result = await gasClient.post('addMaintenanceEntry', {
     *   equipmentId: 'abc-123',
     *   date: '2025-01-15',
     *   type: 'Техническое обслуживание',
     *   description: 'Замена фильтрующего элемента',
     *   performedBy: 'Иванов И.И.',
     * });
     */
    async post<T>(action: string, data: Record<string, unknown>): Promise<T> {
        return this.fetchWithRetry<T>(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ action, ...data }),
        }, action);
    }
}

// ============================================
// Экспорт singleton
// ============================================

/**
 * Singleton экземпляр GAS-клиента.
 *
 * Создаётся один раз при загрузке модуля.
 * Все tools используют этот единственный экземпляр:
 *
 *   import { gasClient } from '../services/gasClient.js';
 *   const data = await gasClient.get('getAll', { search: 'фильтр' });
 */
export const gasClient = new GasClient();
