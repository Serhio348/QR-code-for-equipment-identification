/**
 * POST запросы (мутации) для работы с оборудованием
 *
 * SEC-02: все мутации идут через Express backend с Bearer-токеном.
 * Прямые вызовы GAS и no-cors fallback отключены.
 */

import { Equipment } from '../types/equipment';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';
import { API_CONFIG } from '@/shared/config/api';
import { supabase } from '@/shared/config/supabase';

const BACKEND_API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

function backendUrl(path: string): string {
  if (BACKEND_API_URL) return `${BACKEND_API_URL}${path}`;
  return path;
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) {
    throw new Error('Не авторизован');
  }

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  if (expiresAtMs != null && expiresAtMs <= Date.now() + 30_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }
  }

  return session.access_token;
}

async function postEquipmentMutation<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(backendUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Сессия истекла. Войдите снова.');
    }
    if (response.status === 403) {
      throw new Error('Недостаточно прав для изменения оборудования');
    }
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: string;
  } | null;

  if (!json) throw new Error('Не удалось прочитать ответ сервера');
  if (json.success === false) throw new Error(json.error || 'Ошибка сервера');
  if (json.data == null) throw new Error('Сервер не вернул data');
  return json.data;
}

/**
 * Добавить новое оборудование
 */
export async function addEquipment(
  equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Equipment> {
  if (!equipment.name) {
    throw new Error('Название оборудования обязательно');
  }
  if (!equipment.type) {
    throw new Error('Тип оборудования обязателен');
  }

  console.log('📤 Добавление оборудования через backend:', {
    name: equipment.name,
    type: equipment.type,
    status: equipment.status,
  });

  const created = await postEquipmentMutation<Equipment>('/api/equipment/add', equipment);

  logUserActivity(
    'equipment_create',
    `Создано оборудование: "${created.name}" (${created.type})`,
    {
      entityType: 'equipment',
      entityId: created.id,
      metadata: {
        type: created.type,
        status: created.status,
      },
    }
  );

  return created;
}

/**
 * Обновить оборудование
 */
export async function updateEquipment(
  id: string,
  updates: Partial<Equipment>
): Promise<Equipment> {
  if (!id) {
    throw new Error('ID не указан');
  }

  const normalizedUpdates = { ...updates };
  if (normalizedUpdates.commissioningDate) {
    const dateStr = String(normalizedUpdates.commissioningDate).split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      normalizedUpdates.commissioningDate = dateStr;
    }
  }
  if (normalizedUpdates.lastMaintenanceDate) {
    const dateStr = String(normalizedUpdates.lastMaintenanceDate).split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      normalizedUpdates.lastMaintenanceDate = dateStr;
    }
  }

  console.log('📤 Обновление оборудования через backend:', { id });

  const updated = await postEquipmentMutation<Equipment>('/api/equipment/update', {
    id,
    ...normalizedUpdates,
  });

  logUserActivity(
    'equipment_update',
    `Обновлено оборудование: "${updated.name}"`,
    {
      entityType: 'equipment',
      entityId: updated.id,
      metadata: {
        updatedFields: Object.keys(normalizedUpdates),
      },
    }
  );

  return updated;
}

/**
 * Удалить оборудование (физическое удаление)
 */
export async function deleteEquipment(id: string): Promise<void> {
  if (!id) {
    throw new Error('ID не указан');
  }

  console.log('🗑️ Удаление оборудования через backend:', { id });

  await postEquipmentMutation<{ success?: boolean; message?: string }>(
    '/api/equipment/delete',
    { id }
  );

  logUserActivity(
    'equipment_delete',
    `Удалено оборудование (ID: ${id.substring(0, 8)}...)`,
    {
      entityType: 'equipment',
      entityId: id,
    }
  );
}
