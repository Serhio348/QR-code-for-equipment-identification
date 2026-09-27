/**
 * Подписи и отпечаток панели графика водного баланса.
 * Чистые функции, чтобы подпись серии не зависела от разметки дашборда.
 */

export function balanceChartSeriesLabel(name: string | undefined): string {
  if (name === 'source') return 'Скважина';
  if (name === 'losses') return 'Потери';
  return name ?? '';
}

export function balanceDockedTipFingerprint(
  label: string | number | undefined,
  list: ReadonlyArray<{ name?: unknown; value?: unknown }>,
): string {
  return `${String(label)}|${list.map(entry => `${String(entry.name)}:${String(entry.value)}`).join(';')}`;
}
