/**
 * Типы для технического освидетельствования энергоисточников
 */

/**
 * Данные технического освидетельствования
 */
export interface TechnicalInspectionData {
  /** Номер акта освидетельствования */
  actNumber: string;
  
  /** Дата освидетельствования */
  inspectionDate: string;
  
  /** Город (место составления акта) */
  city?: string;
  
  /** Организация */
  organization?: string;
  
  /** Количество котлов */
  boilersCount?: string;
  
  /** Тип и марка предохранительного устройства */
  safetyDeviceType?: string;
  
  /** Наименование и адрес объекта (котельной) */
  facilityName?: string;
  facilityAddress?: string;
  
  /** Регистрационный номер оборудования */
  registrationNumber?: string;
  
  /** Серийный номер оборудования */
  serialNumber?: string;
  
  /** Тип энергоисточника */
  energySourceType?: string;
  
  /** Мощность (кВт) */
  powerKw?: string;
  
  /** Рабочее давление */
  workingPressure?: string;
  
  /** Результаты внешнего осмотра */
  externalInspection: string;
  
  /** Результаты гидравлического испытания */
  hydraulicTest: string;
  
  /** Результаты проверки предохранительных клапанов */
  safetyValvesCheck: string;
  
  /** Результаты проверки автоматики безопасности */
  safetyAutomationCheck?: string;
  
  /** Результаты проверки контрольно-измерительных приборов */
  instrumentsCheck?: string;
  
  /** Заключение (годен/не годен) */
  conclusion: 'suitable' | 'unsuitable';
  
  /** Примечания */
  notes?: string;
  
  /** Председатель комиссии */
  commissionChairman: string;
  
  /** Должность председателя комиссии */
  commissionChairmanPosition?: string;
  
  /** Члены комиссии с должностями */
  commissionMembers: Array<{
    position?: string;
    name: string;
  }>;
  
  /** Следующее освидетельствование */
  nextInspectionDate?: string;
}

/**
 * Данные для создания записи технического освидетельствования
 */
export interface TechnicalInspectionInput extends TechnicalInspectionData {
  /** ID оборудования */
  equipmentId: string;
  
  /** ФИО исполнителя (для записи в журнал) */
  performedBy: string;
}
