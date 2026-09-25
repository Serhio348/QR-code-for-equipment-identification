/**
 * toolAccessPolicy.ts
 *
 * SEC-05: какие AI tools доступны при каких правах раздела.
 *
 * Структура / что умеет:
 * 1. getToolRequiredApp — equipment | water | null (общие)
 * 2. isToolAllowedForAccess — проверка одного tool
 * 3. filterToolsByAccess — отфильтровать массив определений
 */

import type { UserAppAccess } from './userAppAccessService.js';

/** Раздел, без которого tool запрещён. null = доступен любому вошедшему. */
export type ToolAppRequirement = 'equipment' | 'water' | null;

const EQUIPMENT_TOOLS = new Set([
  'get_all_equipment',
  'get_equipment_details',
  'get_maintenance_log',
  'add_maintenance_entry',
  'attach_files_to_entry',
  'search_files_in_folder',
  'read_file_content',
  'ensure_drive_folder_path',
  'upload_photos_to_folder',
  'upload_maintenance_photo',
  'get_maintenance_photos',
  'search_maintenance_photos',
  'create_document',
]);

const WATER_TOOLS = new Set([
  'get_water_devices',
  'get_water_readings',
  'analyze_water_consumption',
  'save_manual_meter_reading',
  'get_water_quality_analyses',
  'get_all_water_alerts',
  'get_water_quality_alerts',
  'add_water_quality_analysis',
  'get_water_meter_passport',
  'portal_login',
  'portal_list_invoices',
  'portal_download_invoice',
  'portal_read_invoice',
  'portal_list_downloaded',
  'save_invoice',
  'get_invoices',
  'get_invoice_file',
]);

/**
 * Какой раздел нужен для tool. null — memory / document session (без доменных данных).
 */
export function getToolRequiredApp(toolName: string): ToolAppRequirement {
  if (EQUIPMENT_TOOLS.has(toolName)) {
    return 'equipment';
  }
  if (WATER_TOOLS.has(toolName)) {
    return 'water';
  }
  return null;
}

/**
 * Разрешён ли tool при данных правах.
 * Admin → всё; без контекста доступа доменные tools запрещены.
 */
export function isToolAllowedForAccess(
  toolName: string,
  access: UserAppAccess | undefined,
): boolean {
  const required = getToolRequiredApp(toolName);
  if (required === null) {
    return true;
  }
  if (!access) {
    return false;
  }
  if (access.isAdmin) {
    return true;
  }
  return required === 'equipment' ? access.equipment : access.water;
}

/**
 * Оставить только tools, разрешённые правами пользователя.
 */
export function filterToolsByAccess<T extends { name: string }>(
  allTools: T[],
  access: UserAppAccess,
): T[] {
  return allTools.filter((tool) => isToolAllowedForAccess(tool.name, access));
}

/**
 * Блок для системного промпта: права пользователя и как отвечать при отказе.
 */
export function buildAppAccessPrompt(access: UserAppAccess): string {
  const equipmentLabel = access.isAdmin || access.equipment ? 'есть' : 'НЕТ';
  const waterLabel = access.isAdmin || access.water ? 'есть' : 'НЕТ';
  const roleNote = access.isAdmin ? ' (администратор — полный доступ)' : '';

  return `
ДОСТУП ПОЛЬЗОВАТЕЛЯ К РАЗДЕЛАМ${roleNote}:
• Оборудование: ${equipmentLabel}
• Вода: ${waterLabel}

Правила при отсутствии доступа:
- Если пользователь спрашивает про раздел с «НЕТ» — ответь сразу и коротко: раздела нет в его правах, данные получить нельзя, нужно обратиться к администратору.
- Не вызывай инструменты закрытого раздела и не выдумывай показания, журналы, списки оборудования или анализы.
- Не обещай «сейчас посмотрю / запрошу» для закрытого раздела.
`.trim();
}
