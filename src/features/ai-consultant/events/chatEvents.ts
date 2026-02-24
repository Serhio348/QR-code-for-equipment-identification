/**
 * chatEvents.ts
 *
 * Событие для передачи контекста водного дашборда в AI-чат.
 * WaterDashboard диспатчит контекст при загрузке KPI-данных,
 * ChatWidget слушает событие и передаёт данные в системный промпт AI.
 *
 * Использование:
 *   import { setAIChatWaterContext } from '@/features/ai-consultant/events/chatEvents';
 *   setAIChatWaterContext({ monthLabel: 'февраль 2026', sourceMonth: 1234, ... });
 *   setAIChatWaterContext(null); // очистить при уходе со страницы
 */

import type { WaterDashboardContext } from '../services/consultantApi';

export { type WaterDashboardContext };

export const SET_WATER_CONTEXT_EVENT = 'ai-chat:set-water-context';

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
