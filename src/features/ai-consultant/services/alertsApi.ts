/**
 * alertsApi.ts
 *
 * Сервис для получения проактивных водных алертов с бэкенда.
 *
 * Запрашивает GET /api/alerts и возвращает:
 *   - Активные превышения норм качества воды
 *   - Счётчики с просроченной или истекающей поверкой
 */

import { supabase } from '../../../shared/config/supabase';

const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || 'http://localhost:3001';

// ============================================
// Типы
// ============================================

export interface AlertItem {
    id: string;
    type: 'water_quality' | 'meter_verification';
    severity: 'critical' | 'warning';
    title: string;
    description: string;
}

export interface AlertsSummary {
    total: number;
    critical: number;
    warnings: number;
    items: AlertItem[];
}

const EMPTY: AlertsSummary = { total: 0, critical: 0, warnings: 0, items: [] };

// ============================================
// Функция запроса
// ============================================

/**
 * Получить сводку активных алертов по воде.
 * При любой ошибке возвращает пустой объект (тихая деградация).
 */
export async function fetchAlerts(): Promise<AlertsSummary> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return EMPTY;

        const response = await fetch(`${API_URL}/api/alerts`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
            signal: AbortSignal.timeout(10000), // 10 сек таймаут
        });

        if (!response.ok) return EMPTY;

        const json = await response.json();
        return json.data ?? EMPTY;
    } catch {
        return EMPTY;
    }
}
