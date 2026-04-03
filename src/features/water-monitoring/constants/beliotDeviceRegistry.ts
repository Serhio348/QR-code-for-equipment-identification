/**
 * Реестр счётчиков Beliot на клиенте: ID и группы для вкладки «Счётчики воды».
 * Синхронизируйте с фактическим списком в Beliot / GitHub Action export.
 */

export type BeliotDeviceGroupConfig = {
  name: string;
  deviceIds: string[];
};

/**
 * Счётчик учёта ввода с ул. Орджоникидзе — отдельно от ХВО (не путать с ЛУ/АЛПО/сортировкой).
 * При несовпадении с Beliot замените значение здесь.
 */
export const ORDZHONIKIDZE_STREET_INLET_DEVICE_ID = '10586';

export const BELOT_DEVICE_GROUPS: BeliotDeviceGroupConfig[] = [
  { name: 'ХВО', deviceIds: ['10597', '10596', '10598', '11363'] },
  { name: 'Ввод, ул. Орджоникидзе', deviceIds: [ORDZHONIKIDZE_STREET_INLET_DEVICE_ID] },
  { name: 'АБК по ул.Советская, 2', deviceIds: ['11015', '11016'] },
  { name: 'АБК по ул.Советская, 2/1', deviceIds: ['11019', '11018'] },
  { name: 'Скважина', deviceIds: ['11013'] },
  { name: 'Посудо-тарный участок', deviceIds: ['11078'] },
  { name: 'Пожаротушение', deviceIds: ['11365', '11366'] },
];

const FIRE_SUPPRESSION_GROUP = BELOT_DEVICE_GROUPS.find((g) => g.name === 'Пожаротушение');

/** Подпись единого ряда пожаротушения на дашборде */
export const FIRE_SUPPRESSION_DISPLAY_LABEL = FIRE_SUPPRESSION_GROUP?.name ?? 'Пожаротушение';

/** device_id пожаротушения — на дашборде один ряд, расход суммируется */
export const FIRE_SUPPRESSION_DEVICE_IDS = new Set<string>(FIRE_SUPPRESSION_GROUP?.deviceIds ?? []);

/**
 * Подпись ряда на графике баланса для хозбыта: сдвоенное пожаротушение — одна легенда и сумма.
 */
export function domesticBalanceLabelForDevice(deviceId: string, fallbackLabel: string): string {
  if (FIRE_SUPPRESSION_DEVICE_IDS.has(deviceId)) return FIRE_SUPPRESSION_DISPLAY_LABEL;
  return fallbackLabel;
}

/** Все device_id из групп (уникальные, порядок — как в группах сверху вниз). */
export function getBeliotUiDeviceIds(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of BELOT_DEVICE_GROUPS) {
    for (const id of g.deviceIds) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/** Строка как из beliot_device_overrides (минимум полей для дашборда). */
export type BeliotDashboardOverrideRow = {
  device_id: string;
  name: string | null;
  object_name: string | null;
  address: string | null;
  device_role: string | null;
};

/**
 * Если для нового счётчика ещё нет строки в beliot_device_overrides,
 * подставляем черновик, чтобы дашборд мог учитывать устройство (роль можно потом поправить в UI/таблице).
 */
/** Счётчики на границе ХВО (умягчённая вода): роль production, но не суммируются с ЛУ/АЛПО/сортировкой в распределении */
export const HVO_AGGREGATE_WATER_DEVICE_IDS = new Set<string>(['11363']);

/**
 * Счётчики ЛУ / АЛПО / сортировка — группа «ХВО» в {@link BELOT_DEVICE_GROUPS} без агрегата умягчения
 * и без уличного ввода (см. «Ввод, ул. Орджоникидзе»). KPI «производственные нужды» = Σ их месячного расхода.
 */
export function getProductionNeedsKpiDeviceIds(): string[] {
  const hvo = BELOT_DEVICE_GROUPS.find((g) => g.name === 'ХВО');
  if (!hvo) return [];
  return hvo.deviceIds.filter((id) => !HVO_AGGREGATE_WATER_DEVICE_IDS.has(id));
}

const DASHBOARD_FALLBACK_ROWS: BeliotDashboardOverrideRow[] = [
  { device_id: '11363', name: 'СВ ДЛ-40', object_name: 'Умягчённая вода', address: null, device_role: 'production' },
  { device_id: '11365', name: 'MWN/JS 20', object_name: 'Пожаротушение', address: null, device_role: 'domestic' },
  { device_id: '11366', name: 'MWN/JS 100', object_name: 'Пожаротушение', address: null, device_role: 'domestic' },
];

export function mergeBeliotOverridesForDashboard(
  rows: BeliotDashboardOverrideRow[],
): BeliotDashboardOverrideRow[] {
  const byId = new Map(rows.map((r) => [r.device_id, r]));
  for (const fb of DASHBOARD_FALLBACK_ROWS) {
    if (!byId.has(fb.device_id)) {
      byId.set(fb.device_id, fb);
    }
  }
  return Array.from(byId.values());
}
