/**
 * equipmentCardState.ts
 *
 * Состояние карточки оборудования без демонстрационных данных.
 *
 * 1. equipmentCardState — загрузка, отсутствие записи, ошибка сети или готовая карточка
 * 2. verifiedQrUrl — QR только для непустой ссылки этой записи
 */

export type EquipmentCardState = 'loading' | 'not-found' | 'error' | 'ready';

export function equipmentCardState(input: {
  loading: boolean;
  notFound: boolean;
  loadError: string | null;
  hasEquipment: boolean;
}): EquipmentCardState {
  if (input.loading) return 'loading';
  if (input.notFound || !input.hasEquipment) {
    return input.loadError ? 'error' : 'not-found';
  }
  return 'ready';
}

export function verifiedQrUrl(qrCodeUrl: string | null | undefined): string | null {
  const value = qrCodeUrl?.trim() ?? '';
  return value.length > 0 ? value : null;
}
