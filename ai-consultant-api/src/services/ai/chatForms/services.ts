/**
 * services.ts
 *
 * Справочники и запись для бланков.
 * Новых функций записи нет: журнал и анализ вызывают существующие tools.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../../config/env.js';
import { executeEquipmentTool } from '../../../tools/equipmentTools.js';
import { executeWaterTool } from '../../../tools/waterTools.js';
import type {
  EquipmentRecord,
  FormServices,
  MaintenanceWriteInput,
  SamplingPointRecord,
  WaterAnalysisWriteInput,
} from './types.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

function textField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readEquipment(value: unknown): EquipmentRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const nested = row.equipment && typeof row.equipment === 'object' && !Array.isArray(row.equipment)
    ? row.equipment as Record<string, unknown>
    : row;
  const id = textField(nested.id);
  const name = textField(nested.name);
  if (!id || !name) return null;
  const sheet = textField(nested.maintenanceSheetId);
  return { id, name, maintenanceSheetId: sheet || undefined };
}

function readEquipmentList(value: unknown): EquipmentRecord[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  return rows.map(readEquipment).filter((item): item is EquipmentRecord => item !== null);
}

export const productionFormServices: FormServices = {
  async listEquipment(): Promise<EquipmentRecord[]> {
    const data = await executeEquipmentTool('get_all_equipment', {});
    return readEquipmentList(data);
  },
  async getEquipment(id: string): Promise<EquipmentRecord | null> {
    const data = await executeEquipmentTool('get_equipment_details', { equipment_id: id });
    const equipment = readEquipment(data);
    return equipment?.id === id ? equipment : null;
  },
  async listSamplingPoints(): Promise<SamplingPointRecord[]> {
    const { data, error } = await supabase
      .from('sampling_points')
      .select('id, code, name')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => {
      const id = textField(row.id);
      const name = textField(row.name);
      const code = textField(row.code);
      return id && name ? [{ id, name, code }] : [];
    });
  },
  async addMaintenanceEntry(input: MaintenanceWriteInput): Promise<void> {
    await executeEquipmentTool('add_maintenance_entry', { ...input });
  },
  async addWaterAnalysis(input: WaterAnalysisWriteInput): Promise<void> {
    await executeWaterTool('add_water_quality_analysis', { ...input });
  },
};
