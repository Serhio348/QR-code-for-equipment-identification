/**
 * tools/index.ts
 *
 * Центральный реестр всех tools (инструментов) AI-консультанта.
 *
 * Этот файл выполняет две задачи:
 * 1. Объединяет определения tools из разных модулей в один массив
 * 2. Маршрутизирует вызовы tools к соответствующим исполнителям
 *
 * Архитектура tools разделена по доменам:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  tools/index.ts (этот файл)                                │
 * │  ┌─────────────────────┐  ┌──────────────────────────┐     │
 * │  │  equipmentTools.ts  │  │  driveTools.ts            │     │
 * │  │  ─────────────────  │  │  ────────────────────     │     │
 * │  │  get_all_equipment  │  │  search_files_in_folder   │     │
 * │  │  get_equipment_     │  │  read_file_content        │     │
 * │  │    details          │  │                            │     │
 * │  │  get_maintenance_   │  │                            │     │
 * │  │    log              │  │                            │     │
 * │  │  add_maintenance_   │  │                            │     │
 * │  │    entry            │  │                            │     │
 * │  └─────────────────────┘  └──────────────────────────┘     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Используется в anthropic.ts:
 *   import { tools, executeToolCall } from '../tools/index.js';
 *   - tools → передаётся в anthropic.messages.create({ tools })
 *   - executeToolCall → вызывается в агентном цикле при tool_use
 *
 * Для добавления нового модуля tools:
 * 1. Создать файл (например, notificationTools.ts)
 * 2. Экспортировать массив tools и функцию-исполнитель
 * 3. Импортировать и добавить в этот файл (tools + toolExecutors)
 */

// ============================================
// Импорты
// ============================================

// Типы Anthropic SDK — нужен Anthropic.Tool для типизации массива tools
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

// Tools для работы с оборудованием (Google Sheets через GAS API):
// - equipmentTools: определения 4 инструментов (поиск, детали, журнал, добавление записи)
// - executeEquipmentTool: функция выполнения — маршрутизирует к gasClient.get/post
import { equipmentTools, executeEquipmentTool } from './equipmentTools.js';

// Tools для работы с Google Drive (файлы через GAS API):
// - driveTools: определения 2 инструментов (поиск файлов, чтение содержимого)
// - executeDriveTool: функция выполнения — парсит Drive URL и вызывает gasClient.get
import { driveTools, executeDriveTool } from './driveTools.js';

// Tools для работы с фото обслуживания (загрузка, просмотр, поиск):
// - photoTools: определения 3 инструментов (загрузка, список, поиск фото)
// - executePhotoTool: функция выполнения — загружает фото через gasClient.post
import { photoTools, executePhotoTool } from './photoTools.js';

// Tools для создания документов (Google Doc, Google Sheet):
// - documentTools: определение 1 инструмента (create_document)
// - executeDocumentTool: функция выполнения — создаёт документ через gasClient.post
import { documentTools, executeDocumentTool } from './documentTools.js';

// Tools для работы с водными данными (Supabase):
// - waterTools: 7 инструментов (показания счётчиков, анализ потребления, качество воды, алерты, паспорт)
// - executeWaterTool: функция выполнения — запросы к Supabase напрямую
import { waterTools, executeWaterTool } from './waterTools.js';

// ============================================
// Объединённый массив tools
// ============================================

/**
 * Полный список всех tools, доступных Claude AI.
 *
 * Этот массив передаётся в каждый запрос к Claude API
 * через параметр `tools` в anthropic.messages.create().
 * Claude видит все инструменты и решает, какие вызвать.
 *
 * Текущий состав (16 tools):
 * - get_all_equipment              — поиск/список оборудования
 * - get_equipment_details          — детали одного оборудования
 * - get_maintenance_log            — журнал обслуживания
 * - add_maintenance_entry          — добавление записи в журнал
 * - search_files_in_folder         — поиск файлов в папке Drive
 * - read_file_content              — чтение содержимого файла
 * - upload_maintenance_photo       — загрузка фото обслуживания
 * - get_maintenance_photos         — получение списка фото
 * - search_maintenance_photos      — поиск фото по запросу
 * - create_document                — создание Google Doc или Google Sheet
 * - get_water_devices              — список счётчиков с названиями и объектами
 * - get_water_readings             — показания счётчиков воды из Supabase
 * - analyze_water_consumption      — анализ потребления воды за период
 * - save_manual_meter_reading      — сохранение показания с фото счётчика
 * - get_water_quality_analyses     — журнал анализов качества воды
 * - get_water_quality_alerts       — превышения норм качества воды
 * - add_water_quality_analysis     — создание записи анализа
 * - get_water_meter_passport       — паспорт счётчика (производитель, поверка, серийный номер)
 */
export const tools: Anthropic.Tool[] = [
    ...equipmentTools,
    ...driveTools,
    ...photoTools,
    ...documentTools,
    ...waterTools,
];

// ============================================
// Маршрутизация вызовов tools
// ============================================

/**
 * Маппинг: имя tool → функция-исполнитель.
 *
 * Когда Claude вызывает tool по имени (например, 'get_all_equipment'),
 * нужно определить, какая функция его выполнит.
 *
 * Все equipment tools направляются в executeEquipmentTool,
 * все drive tools — в executeDriveTool.
 * Внутри каждой функции есть switch/case по имени tool.
 *
 * Тип значения: функция (name, input) => Promise<unknown>
 * — единый интерфейс для всех исполнителей.
 */
const toolExecutors: Record<string, (name: string, input: Record<string, unknown>) => Promise<unknown>> = {
    // Equipment tools → executeEquipmentTool (GAS: getAll, getById, getMaintenanceLog, addMaintenanceEntry)
    'get_all_equipment': executeEquipmentTool,
    'get_equipment_details': executeEquipmentTool,
    'get_maintenance_log': executeEquipmentTool,
    'add_maintenance_entry': executeEquipmentTool,
    'attach_files_to_entry': executeEquipmentTool,

    // Drive tools → executeDriveTool (GAS: getFolderFiles, getFileContent)
    'search_files_in_folder': executeDriveTool,
    'read_file_content': executeDriveTool,

    // Photo tools → executePhotoTool (GAS: uploadMaintenancePhoto, getMaintenancePhotos, searchMaintenancePhotos)
    'upload_maintenance_photo': executePhotoTool,
    'get_maintenance_photos': executePhotoTool,
    'search_maintenance_photos': executePhotoTool,

    // Document tools → executeDocumentTool (GAS: createDocument)
    'create_document': executeDocumentTool,

    // Water tools → executeWaterTool (Supabase: beliot_device_readings, water_analysis, etc.)
    'get_water_devices': executeWaterTool,
    'get_water_readings': executeWaterTool,
    'analyze_water_consumption': executeWaterTool,
    'save_manual_meter_reading': executeWaterTool,
    'get_water_quality_analyses': executeWaterTool,
    'get_water_quality_alerts': executeWaterTool,
    'add_water_quality_analysis': executeWaterTool,
    'get_water_meter_passport': executeWaterTool,
};

// ============================================
// Функция выполнения tool
// ============================================

/**
 * Выполняет tool по имени, делегируя вызов нужному исполнителю.
 *
 * Вызывается из anthropic.ts в агентном цикле:
 * ```
 * const result = await executeToolCall(toolUse.name, toolUse.input);
 * ```
 *
 * Порядок работы:
 * 1. Ищет исполнителя в toolExecutors по имени tool
 * 2. Если не найден — выбрасывает ошибку (Claude получит is_error: true)
 * 3. Если найден — вызывает исполнителя и возвращает результат
 *
 * @param name - Имя tool, которое Claude указал в tool_use блоке
 * @param input - Параметры, сформированные Claude на основе input_schema
 * @returns Результат выполнения (JSON от GAS API)
 * @throws Error если tool с таким именем не зарегистрирован
 *
 * @example
 * // Claude вызвал tool_use: search_files_in_folder
 * const files = await executeToolCall('search_files_in_folder', {
 *   folder_url: 'https://drive.google.com/drive/folders/ABC123'
 * });
 */
export async function executeToolCall(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    console.log(`[${requestId}] Tool ${name} called`);
    
    // Поиск исполнителя по имени tool
    const executor = toolExecutors[name];

    // Tool не зарегистрирован — Claude вызвал несуществующий инструмент.
    // Такое может случиться, если определения tools и toolExecutors
    // рассинхронизировались (добавили tool, но забыли добавить executor)
    if (!executor) {
        const availableTools = Object.keys(toolExecutors).join(', ');
        console.error(`[${requestId}] Unknown tool: ${name}. Available: ${availableTools}`);
        throw new Error(`Unknown tool: ${name}`);
    }

    try {
        const result = await executor(name, input);
        const duration = Date.now() - startTime;
        console.log(`[${requestId}] Tool ${name} completed in ${duration}ms`);
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${requestId}] Tool ${name} failed after ${duration}ms:`, error);
        throw error;
    }
}

/**
 * Валидация регистрации tools при запуске приложения.
 * Проверяет, что для каждого tool есть исполнитель и наоборот.
 *
 * @throws Error если найдены расхождения
 */
export function validateToolRegistration(): void {
    const registeredToolNames = new Set(tools.map(t => t.name));
    const executorToolNames = new Set(Object.keys(toolExecutors));
    
    const toolsWithoutExecutor = [...registeredToolNames]
        .filter(name => !executorToolNames.has(name));
        
    const executorsWithoutTool = [...executorToolNames]
        .filter(name => !registeredToolNames.has(name));
    
    if (toolsWithoutExecutor.length > 0 || executorsWithoutTool.length > 0) {
        const errors: string[] = [];
        
        if (toolsWithoutExecutor.length > 0) {
            errors.push(`Tools без исполнителей: ${toolsWithoutExecutor.join(', ')}`);
        }
        
        if (executorsWithoutTool.length > 0) {
            errors.push(`Исполнители без tool определений: ${executorsWithoutTool.join(', ')}`);
        }
        
        throw new Error(`Ошибка регистрации tools:\n${errors.join('\n')}`);
    }
    
    console.log(`✅ Все ${registeredToolNames.size} tools зарегистрированы корректно`);
}