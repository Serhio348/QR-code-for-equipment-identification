/**
 * maintenanceTools.ts
 *
 * MCP инструменты для работы с журналом обслуживания оборудования.
 * Это ОБЁРТКА над существующим GAS API (Google Apps Script).
 *
 * Журнал обслуживания — это записи о проведённых работах:
 * - Техническое обслуживание
 * - Ремонт
 * - Проверки и испытания
 * - Замена расходников
 *
 * Инструменты:
 * - sheets_get_maintenance_log - получить журнал по ID оборудования
 * - sheets_add_maintenance_entry - добавить запись
 * - sheets_update_maintenance_entry - обновить запись
 * - sheets_delete_maintenance_entry - удалить запись
 */

// ============================================
// Импорты
// ============================================

// Тип MCP сервера
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Zod для валидации
import { z } from 'zod';

// HTTP клиент для GAS API
import { gasClient } from '../clients/gasClient.js';

// Типы журнала обслуживания
import type { MaintenanceEntry } from '../types/maintenance.js';

// Обработка ошибок
import { getErrorMessage } from '../utils/errorHandler.js';

// ============================================
// Константы
// ============================================

/**
 * Допустимые статусы записи обслуживания.
 * Используем as const для создания tuple типа.
 *
 * as const превращает ['a', 'b'] в readonly ['a', 'b']
 * Это нужно для z.enum() который требует readonly массив
 */
const MAINTENANCE_STATUSES = ['completed', 'planned', 'in_progress', 'cancelled'] as const;

// ============================================
// Zod Схемы
// ============================================

/**
 * Схема для получения журнала обслуживания.
 * Нужен только ID оборудования.
 */
const getMaintenanceLogSchema = z.object({
  // ID оборудования (обязательно)
  equipmentId: z.string().min(1, 'ID оборудования обязателен'),

  // Фильтр по статусу (опционально)
  status: z.enum(MAINTENANCE_STATUSES).optional(),

  // Ограничение количества записей (опционально)
  limit: z.number().min(1).max(500).optional(),
});

/**
 * Схема для добавления записи в журнал.
 *
 * Регулярное выражение для даты:
 * .regex(/^\d{4}-\d{2}-\d{2}$/) проверяет формат YYYY-MM-DD
 *
 * Разбор regex:
 * ^        - начало строки
 * \d{4}    - ровно 4 цифры (год)
 * -        - дефис
 * \d{2}    - ровно 2 цифры (месяц)
 * -        - дефис
 * \d{2}    - ровно 2 цифры (день)
 * $        - конец строки
 */
const addMaintenanceEntrySchema = z.object({
  // ID оборудования - к какому оборудованию относится запись
  equipmentId: z.string().min(1, 'ID оборудования обязателен'),

  // Дата обслуживания в формате YYYY-MM-DD
  date: z.string()
    .min(1, 'Дата обязательна')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD'),

  // Тип работы (что делали)
  type: z.string().min(1, 'Тип работы обязателен'),

  // Описание выполненных работ
  description: z.string().min(1, 'Описание обязательно'),

  // Кто выполнил работу
  performedBy: z.string().min(1, 'Исполнитель обязателен'),

  // Статус работы (по умолчанию 'completed')
  status: z.enum(MAINTENANCE_STATUSES).default('completed'),
});

/**
 * Схема для обновления записи.
 *
 * entryId обязателен - чтобы знать КАКУЮ запись обновлять.
 * Остальные поля опциональные - обновляем только то что передано.
 */
const updateMaintenanceEntrySchema = z.object({
  // ID записи для обновления (обязательно)
  entryId: z.string().min(1, 'ID записи обязателен'),

  // Все остальные поля опциональные
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD')
    .optional(),

  type: z.string().optional(),
  description: z.string().optional(),
  performedBy: z.string().optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
});

/**
 * Схема для удаления записи.
 */
const deleteMaintenanceEntrySchema = z.object({
  // ID записи для удаления
  entryId: z.string().min(1, 'ID записи обязателен'),
});

// ============================================
// Регистрация инструментов
// ============================================

/**
 * Регистрирует все инструменты для работы с журналом обслуживания.
 *
 * @param server - экземпляр MCP сервера
 */
export function registerMaintenanceTools(server: McpServer): void {

  // ==========================================
  // Инструмент 1: Получить журнал обслуживания
  // ==========================================

  server.tool(
    'sheets_get_maintenance_log',

    'Получить журнал обслуживания для конкретного оборудования. ' +
    'Требуется ID оборудования. ' +
    'Можно фильтровать по статусу (completed, planned, in_progress, cancelled) ' +
    'и ограничить количество записей.',

    getMaintenanceLogSchema.shape,

    async (params) => {
      try {
        // Валидация
        const parsed = getMaintenanceLogSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Формируем параметры запроса
        const queryParams: Record<string, string> = {
          equipmentId: parsed.data.equipmentId,
        };

        // Добавляем опциональные фильтры
        if (parsed.data.status) {
          queryParams.status = parsed.data.status;
        }
        if (parsed.data.limit) {
          queryParams.limit = String(parsed.data.limit);
        }

        // Вызываем GAS API
        // Действие 'getMaintenanceLog' возвращает массив записей
        const entries = await gasClient.get<MaintenanceEntry[]>(
          'getMaintenanceLog',
          queryParams
        );

        // Проверяем результат
        if (!entries || entries.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Журнал обслуживания для оборудования "${parsed.data.equipmentId}" пуст.`,
            }],
          };
        }

        // Форматируем вывод
        return {
          content: [{
            type: 'text' as const,
            text: `Найдено записей: ${entries.length}\n\n${JSON.stringify(entries, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка получения журнала: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 2: Добавить запись
  // ==========================================

  server.tool(
    'sheets_add_maintenance_entry',

    'Добавить новую запись в журнал обслуживания оборудования. ' +
    'Обязательные поля: equipmentId, date (YYYY-MM-DD), type, description, performedBy. ' +
    'Статус по умолчанию: completed.',

    addMaintenanceEntrySchema.shape,

    async (params) => {
      try {
        const parsed = addMaintenanceEntrySchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // POST запрос на добавление записи
        // Действие 'addMaintenanceEntry' добавляет строку в лист журнала
        const created = await gasClient.post<MaintenanceEntry>(
          'addMaintenanceEntry',
          parsed.data as Record<string, unknown>
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Запись добавлена в журнал!\n\n${JSON.stringify(created, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка добавления записи: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 3: Обновить запись
  // ==========================================

  server.tool(
    'sheets_update_maintenance_entry',

    'Обновить существующую запись в журнале обслуживания. ' +
    'Обязателен entryId (ID записи). ' +
    'Можно обновить: date, type, description, performedBy, status.',

    updateMaintenanceEntrySchema.shape,

    async (params) => {
      try {
        const parsed = updateMaintenanceEntrySchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // POST запрос на обновление
        const updated = await gasClient.post<MaintenanceEntry>(
          'updateMaintenanceEntry',
          parsed.data as Record<string, unknown>
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Запись обновлена!\n\n${JSON.stringify(updated, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка обновления записи: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 4: Удалить запись
  // ==========================================

  server.tool(
    'sheets_delete_maintenance_entry',

    'Удалить запись из журнала обслуживания по её ID.',

    deleteMaintenanceEntrySchema.shape,

    async (params) => {
      try {
        const parsed = deleteMaintenanceEntrySchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // POST запрос на удаление
        await gasClient.post<{ success: boolean }>(
          'deleteMaintenanceEntry',
          { entryId: parsed.data.entryId }
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Запись "${parsed.data.entryId}" успешно удалена из журнала.`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка удаления записи: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
