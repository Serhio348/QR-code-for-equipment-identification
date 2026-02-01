/**
 * equipmentTools.ts
 *
 * MCP инструменты для работы с оборудованием.
 * Это ОБЁРТКА над существующим GAS API (Google Apps Script).
 *
 * Каждый инструмент = одна операция CRUD:
 * - sheets_get_all_equipment - получить всё оборудование
 * - sheets_get_equipment - получить по ID
 * - sheets_create_equipment - создать (+ папка в Drive создаётся автоматически в GAS)
 * - sheets_update_equipment - обновить
 * - sheets_delete_equipment - удалить (+ папка удаляется автоматически в GAS)
 */

// ============================================
// Импорты
// ============================================

// Тип McpServer из SDK - нужен для типизации параметра server
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Zod - библиотека для валидации данных
// z - это главный объект Zod, через него создаются схемы
import { z } from 'zod';

// Наш HTTP клиент для GAS API
import { gasClient } from '../clients/gasClient.js';

// Типы оборудования из нашего проекта
import type { Equipment, CreateEquipmentInput, UpdateEquipmentInput, EquipmentFilter } from '../types/equipment.js';

// Функция для форматирования ошибок
import { getErrorMessage } from '../utils/errorHandler.js';

// ============================================
// Zod Схемы для валидации входных данных
// ============================================

/**
 * Схема для характеристик оборудования.
 *
 * z.object({}) - создает схему объекта
 * z.string() - валидация строки
 * .optional() - поле необязательное
 * .passthrough() - разрешает дополнительные поля (для [key: string])
 */
const equipmentSpecsSchema = z.object({
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  registrationNumber: z.string().optional(),
  energySourceType: z.string().optional(),
  powerKw: z.string().optional(),
  workingPressure: z.string().optional(),
  nextTestDate: z.string().optional(),
}).passthrough(); // .passthrough() позволяет передавать любые дополнительные поля

/**
 * Схема для создания оборудования.
 *
 * z.enum([...]) - только указанные значения
 * .default('active') - значение по умолчанию
 */
const createEquipmentSchema = z.object({
  // Обязательные поля (без .optional())
  name: z.string().min(1, 'Название обязательно'), // .min(1) - минимум 1 символ
  type: z.string().min(1, 'Тип обязателен'),

  // Опциональные поля
  specs: equipmentSpecsSchema.optional(),
  googleDriveUrl: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  commissioningDate: z.string().optional(),
  lastMaintenanceDate: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  maintenanceSheetId: z.string().optional(),
  maintenanceSheetUrl: z.string().optional(),
  parentFolderId: z.string().optional(), // ID родительской папки для Drive
});

/**
 * Схема для обновления оборудования.
 *
 * .partial() - делает ВСЕ поля опциональными
 * Это нужно потому что при обновлении можно менять только часть полей
 */
const updateEquipmentSchema = z.object({
  // ID обязателен - чтобы знать ЧТО обновлять
  id: z.string().min(1, 'ID обязателен'),

  // Все остальные поля опциональные
  name: z.string().optional(),
  type: z.string().optional(),
  specs: equipmentSpecsSchema.optional(),
  googleDriveUrl: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  commissioningDate: z.string().optional(),
  lastMaintenanceDate: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  maintenanceSheetId: z.string().optional(),
  maintenanceSheetUrl: z.string().optional(),
});

/**
 * Схема для фильтрации оборудования.
 */
const filterEquipmentSchema = z.object({
  type: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  search: z.string().optional(),
});

/**
 * Схема для получения по ID.
 */
const getByIdSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
});

// ============================================
// Регистрация инструментов
// ============================================

/**
 * Регистрирует все инструменты для работы с оборудованием.
 *
 * @param server - экземпляр MCP сервера
 *
 * Эта функция вызывается из server.ts при создании сервера.
 * Каждый вызов server.tool() регистрирует один инструмент.
 *
 * Формат: server.tool(name, description, schema, handler)
 * - name: уникальное имя инструмента (string)
 * - description: описание для LLM (string)
 * - schema: Zod схема входных данных
 * - handler: async функция-обработчик
 */
export function registerEquipmentTools(server: McpServer): void {

  // ==========================================
  // Инструмент 1: Получить всё оборудование
  // ==========================================

  server.tool(
    // Имя инструмента - используется при вызове
    'sheets_get_all_equipment',

    // Описание - LLM читает это чтобы понять когда использовать
    'Получить список всего оборудования из Google Sheets. ' +
    'Можно фильтровать по типу, статусу или искать по названию.',

    // Схема входных данных (Zod)
    // shape преобразует в формат понятный MCP
    filterEquipmentSchema.shape,

    // Обработчик - вызывается когда инструмент используется
    async (params) => {
      try {
        // Валидируем входные данные
        // safeParse возвращает { success, data, error }
        const parsed = filterEquipmentSchema.safeParse(params);

        // Если валидация не прошла - возвращаем ошибку
        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,  // as const - точный тип литерала
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,  // Пометка что это ошибка
          };
        }

        // Формируем параметры для GET запроса
        // Record<string, string> - объект со строковыми ключами и значениями
        const queryParams: Record<string, string> = {};

        // Добавляем только непустые параметры
        if (parsed.data.type) queryParams.type = parsed.data.type;
        if (parsed.data.status) queryParams.status = parsed.data.status;
        if (parsed.data.search) queryParams.search = parsed.data.search;

        // Вызываем GAS API
        // gasClient.get<T>(action, params) - T это тип возвращаемых данных
        const equipment = await gasClient.get<Equipment[]>('getAll', queryParams);

        // Возвращаем результат в формате MCP
        return {
          content: [{
            type: 'text' as const,
            // JSON.stringify с форматированием для читабельности
            // null - без фильтра, 2 - отступ в 2 пробела
            text: JSON.stringify(equipment, null, 2),
          }],
        };

      } catch (error) {
        // При ошибке возвращаем описание проблемы
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка получения оборудования: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 2: Получить оборудование по ID
  // ==========================================

  server.tool(
    'sheets_get_equipment',

    'Получить информацию об одном оборудовании по его ID.',

    getByIdSchema.shape,

    async (params) => {
      try {
        const parsed = getByIdSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Запрос к GAS API с параметром id
        const equipment = await gasClient.get<Equipment>('getById', {
          id: parsed.data.id,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(equipment, null, 2),
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка получения оборудования: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 3: Создать оборудование
  // ==========================================

  server.tool(
    'sheets_create_equipment',

    'Создать новое оборудование в Google Sheets. ' +
    'ВАЖНО: При создании оборудования в GAS бэкенде автоматически создаётся папка в Google Drive ' +
    'и генерируется QR-код со ссылкой на эту папку.',

    createEquipmentSchema.shape,

    async (params) => {
      try {
        const parsed = createEquipmentSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // POST запрос на создание
        // Действие 'add' соответствует обработчику в Code.gs
        const created = await gasClient.post<Equipment>('add', parsed.data as Record<string, unknown>);

        return {
          content: [{
            type: 'text' as const,
            text: `Оборудование создано успешно!\n\n${JSON.stringify(created, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка создания оборудования: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 4: Обновить оборудование
  // ==========================================

  server.tool(
    'sheets_update_equipment',

    'Обновить существующее оборудование по ID. ' +
    'Можно обновить любые поля: название, тип, характеристики, статус и т.д.',

    updateEquipmentSchema.shape,

    async (params) => {
      try {
        const parsed = updateEquipmentSchema.safeParse(params);

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
        // Действие 'update' соответствует обработчику в Code.gs
        const updated = await gasClient.post<Equipment>('update', parsed.data as Record<string, unknown>);

        return {
          content: [{
            type: 'text' as const,
            text: `Оборудование обновлено!\n\n${JSON.stringify(updated, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка обновления оборудования: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 5: Удалить оборудование
  // ==========================================

  server.tool(
    'sheets_delete_equipment',

    'Удалить оборудование по ID. ' +
    'ВАЖНО: При удалении в GAS бэкенде автоматически удаляется папка из Google Drive.',

    getByIdSchema.shape,

    async (params) => {
      try {
        const parsed = getByIdSchema.safeParse(params);

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
        // Действие 'delete' соответствует обработчику в Code.gs
        await gasClient.post<{ success: boolean }>('delete', {
          id: parsed.data.id,
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Оборудование с ID "${parsed.data.id}" успешно удалено.`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка удаления оборудования: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
