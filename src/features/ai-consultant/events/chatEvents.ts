/**
 * chatEvents.ts
 *
 * События для передачи контекста текущего экрана в AI-чат.
 * Страницы оборудования и воды устанавливают структурированный контекст,
 * а ChatWidget передаёт его в системный промпт AI.
 *
 * Использование:
 *   import { setAIChatWaterContext } from '@/features/ai-consultant/events/chatEvents';
 *   setAIChatWaterContext({ monthLabel: 'февраль 2026', sourceMonth: 1234, ... });
 *   setAIChatWaterContext(null); // очистить при уходе со страницы
 */

import type {
  EquipmentContext,
  WaterDashboardContext,
} from '../services/consultantApi';

export { type EquipmentContext, type WaterDashboardContext };

export const SET_WATER_CONTEXT_EVENT = 'ai-chat:set-water-context';
export const SET_EQUIPMENT_CONTEXT_EVENT = 'ai-chat:set-equipment-context';

let currentEquipmentContext: EquipmentContext | null = null;

/**
 * Вернуть контекст уже открытой карточки.
 * Нужен, если ChatWidget загрузился позже страницы оборудования.
 */
export function getAIChatEquipmentContext(): EquipmentContext | null {
  return currentEquipmentContext;
}

/**
 * Установить (или очистить) контекст открытой карточки оборудования.
 */
export function setAIChatEquipmentContext(ctx: EquipmentContext | null): void {
  currentEquipmentContext = ctx;
  window.dispatchEvent(
    new CustomEvent<EquipmentContext | null>(SET_EQUIPMENT_CONTEXT_EVENT, {
      detail: ctx,
    })
  );
}

/**
 * Установить (или очистить) контекст водного дашборда для AI-чата.
 */
export function setAIChatWaterContext(ctx: WaterDashboardContext | null): void {
  window.dispatchEvent(
    new CustomEvent<WaterDashboardContext | null>(SET_WATER_CONTEXT_EVENT, {
      detail: ctx,
    })
  );
}
