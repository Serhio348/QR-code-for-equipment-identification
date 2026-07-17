/**
 * Устройство Beliot в интерфейсе мониторинга.
 *
 * Тип содержит только поля, которые используются UI. Сетевые вызовы к Beliot
 * выполняются backend-сервисом и не входят в этот frontend-контракт.
 */
export interface BeliotDevice {
  _id?: string;
  id?: string;
  device_id?: string;
  name?: string;
  address?: string;
  object_name?: string;
  building_name?: string;
  facility_passport_name?: string;
  serial_number?: string;
  serialNumber?: string;
  serial?: string;
  sn?: string;
  factory_number?: string;
  factoryNumber?: string;
  model?: Record<string, unknown>;
  tied_point?: {
    place?: string;
    [key: string]: unknown;
  };
  last_message_type?: unknown;
  [key: string]: unknown;
}
