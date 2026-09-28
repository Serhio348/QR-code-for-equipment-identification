/**
 * types.ts
 *
 * Декларация бланка и черновика диалога.
 * Описание формы не хранит состояние пользователя.
 */

import type { EquipmentContext } from '../types.js';
import type { UserAppAccess } from '../userAppAccessService.js';

/** Ответ движка. handled=false — сообщение уходит в обычный чат. */
export type FormEngineResult =
  | { handled: true; text: string; suggestions?: string[] }
  | { handled: false };

export interface FormPrompt {
  text: string;
  suggestions?: string[];
}

/**
 * Состояние одного пользователя.
 * В values только короткие строки: id, подписи, числа, флаги.
 */
export interface FormDraft {
  userId: string;
  formId: string;
  values: Record<string, string>;
  /** Ключи ответов в порядке ввода. «Назад» снимает последний. */
  filledOrder: string[];
  currentStep: string;
  awaitingConfirmation: boolean;
  choosingEdit: boolean;
  /** После правки с карточки подтверждения снова показать карточку. */
  returnToConfirmation: boolean;
  updatedAt: number;
  submitting: boolean;
}

export interface AcceptedValue {
  key: string;
  value: string;
  undoable: boolean;
}

export type StepDecision =
  | { type: 'ok'; values: AcceptedValue[]; stepId?: string }
  | {
      type: 'partial';
      values: AcceptedValue[];
      clear?: string[];
      stepId?: string;
      prompt: FormPrompt;
    }
  | { type: 'invalid'; message: string; suggestions?: string[] }
  | { type: 'stay'; values: AcceptedValue[]; prompt: FormPrompt };

export interface EquipmentRecord {
  id: string;
  name: string;
  maintenanceSheetId?: string;
}

export interface SamplingPointRecord {
  id: string;
  name: string;
  code: string;
}

export interface MaintenanceWriteInput {
  equipment_id: string;
  date: string;
  type: string;
  description: string;
  performed_by: string;
  status: string;
  maintenance_sheet_id?: string;
}

export interface WaterAnalysisWriteInput {
  sampling_point_id: string;
  sample_date: string;
  sampled_by: string;
  status: string;
  notes?: string;
  results: Array<{ parameter_name: string; value: number; unit: string }>;
}

/** Чтение справочников и существующие функции записи. */
export interface FormServices {
  listEquipment: () => Promise<EquipmentRecord[]>;
  getEquipment: (id: string) => Promise<EquipmentRecord | null>;
  listSamplingPoints: () => Promise<SamplingPointRecord[]>;
  addMaintenanceEntry: (input: MaintenanceWriteInput) => Promise<void>;
  addWaterAnalysis: (input: WaterAnalysisWriteInput) => Promise<void>;
}

export interface FormRuntime {
  services: FormServices;
  access: UserAppAccess;
  equipmentContext?: EquipmentContext;
  now: number;
  userId: string;
}

export interface FormStep {
  id: string;
  label: string;
  optional: boolean;
  /** Фразы для «изменить …» и меню редактирования. */
  editPhrases: string[];
  prompt: (draft: FormDraft, runtime: FormRuntime) => FormPrompt | Promise<FormPrompt>;
  /** Убрать ответ этого пункта, не трогая остальные поля. */
  onClear?: (draft: FormDraft) => void;
  isDone?: (draft: FormDraft) => boolean;
  /** «Дальше» завершает пункт. */
  onNext?: (draft: FormDraft) => void;
  /** «Пропустить» для optional. */
  onSkip?: (draft: FormDraft) => AcceptedValue[];
}

export interface FormDefinition {
  id: string;
  matchTrigger: (text: string) => { remainder: string; specificity: number } | null;
  isAllowed: (access: UserAppAccess) => boolean;
  steps: FormStep[];
  /** Заполняет пустые поля из карточки оборудования, если id есть в серверном списке. */
  prepare?: (draft: FormDraft, runtime: FormRuntime) => Promise<void>;
  interpret: (text: string, draft: FormDraft, runtime: FormRuntime) => Promise<StepDecision>;
  confirmation: (draft: FormDraft, runtime: FormRuntime) => FormPrompt | Promise<FormPrompt>;
  submit: (draft: FormDraft, runtime: FormRuntime) => Promise<{ ok: true; text: string } | { ok: false; text: string }>;
}

export interface FormHandleInput {
  userId: string;
  text: string;
  access: UserAppAccess;
  equipmentContext?: EquipmentContext;
  now?: number;
}
