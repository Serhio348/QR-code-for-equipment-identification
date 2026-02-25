/**
 * useAlerts.ts
 *
 * Хук для загрузки и периодического обновления проактивных алертов по воде.
 *
 * - Загружает алерты при монтировании
 * - Обновляет каждые 5 минут (polling)
 * - Тихая деградация при ошибках — возвращает пустую сводку
 *
 * Использование:
 *   const { alerts } = useAlerts();
 *   // alerts.total — общее число алертов
 *   // alerts.critical — критических (красный бейдж)
 *   // alerts.items — детали
 */

import { useState, useEffect, useRef } from 'react';
import { fetchAlerts, type AlertsSummary } from '../services/alertsApi';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

const EMPTY: AlertsSummary = { total: 0, critical: 0, warnings: 0, items: [] };

export function useAlerts() {
    const [alerts, setAlerts] = useState<AlertsSummary>(EMPTY);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = async () => {
        const data = await fetchAlerts();
        setAlerts(data);
    };

    useEffect(() => {
        load();
        intervalRef.current = setInterval(load, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return { alerts, refresh: load };
}
