/**
 * WaterDashboard — главный дашборд раздела «Вода».
 *
 * Структура (Вариант 3 — Комбо):
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  KPI: скважина / производство / потери % / алерты           │
 *  ├───────────────────────────────┬──────────────────────────────┤
 *  │  💧 Водный баланс 7 дней      │  🕸 Радар качества воды      │
 *  │  ComposedChart: стек+линия    │  (radar chart, % от нормы)   │
 *  ├───────────────────────────────┴──────────────────────────────┤
 *  │  🔢 Теоретические потери (промывка + ОО)                     │
 *  ├──────────────────────────────────────────────────────────────┤
 *  │  🚨 Активные превышения норм (таблица алертов)               │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Водный баланс:
 *  Потери = Скважина (source) − Σ производство (production)
 *
 * Теоретические потери — промывка фильтров обезжелезивания:
 *  Каждые 120 м³ → 2 фильтра × 800 с × 20 м³/ч = 8.89 м³/цикл
 *  Потери на фильтрах = (Q_source / 120) × 8.89
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/shared/config/supabase';
import { setAIChatWaterContext } from '@/features/ai-consultant/events/chatEvents';
import './WaterDashboard.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type MinMax = { min: number; max: number };

interface SelectedMonth {
  year: number;
  month: number; // 0-based (как в Date)
}

interface DeviceInfo {
  device_id: string;
  name: string;
  role: 'source' | 'production' | 'domestic' | null;
}

interface KpiData {
  sourceMonth: number;       // м³ — скважина за месяц
  productionMonth: number;   // м³ — производство за месяц
  domesticMonth: number;     // м³ — хоз-питьевое за месяц
  lossesMonth: number;       // м³ — потери = source − production − domestic
  lossesPct: number;         // % потерь
  activeAlerts: number;
  criticalAlerts: number;
  lastAnalysisDate: string | null;
  samplingPointsCount: number;
}

interface BalanceDay {
  date: string;
  source: number;
  losses: number;
  [productionDevice: string]: number | string;
}

interface AlertItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  parameter_label: string;
  value: number;
  unit: string;
  deviation_percent: number | null;
  message: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Цвета производственных счётчиков */
const PROD_COLORS = ['#667eea', '#4ecdc4', '#f9ca24', '#f0932b', '#6c5ce7', '#a29bfe'];

/** Цвета хоз-питьевых счётчиков — янтарь/голубой, не совпадают с потерями (красный) */
const DOM_COLORS = ['#d97706', '#06b6d4', '#f472b6', '#84cc16', '#c026d3', '#16a34a'];

/** Цвет потерь */
const LOSSES_COLOR = '#ef4444';

/** Цвет скважины (источника) */
const SOURCE_COLOR = '#1e40af';

const PRIORITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

/**
 * Расчёт теоретических потерь на промывку фильтров обезжелезивания.
 * Каждые 120 м³ через установку: 2 фильтра поочерёдно, 800 с × 20 м³/ч каждый.
 * Потери на цикл = 2 × (800 / 3600) × 20 = 8.889 м³
 */
const FILTER_LOSS_PER_M3 = (2 * (800 / 3600) * 20) / 120; // ≈ 0.07407 м³/м³

// ─── Component ────────────────────────────────────────────────────────────────

const WaterDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({
    sourceMonth: 0,
    productionMonth: 0,
    domesticMonth: 0,
    lossesMonth: 0,
    lossesPct: 0,
    activeAlerts: 0,
    criticalAlerts: 0,
    lastAnalysisDate: null,
    samplingPointsCount: 0,
  });
  const [balanceData, setBalanceData] = useState<BalanceDay[]>([]);
  const [productionDeviceNames, setProductionDeviceNames] = useState<string[]>([]);
  const [domesticDeviceNames, setDomesticDeviceNames] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [hasRoles, setHasRoles] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [hiddenDevices, setHiddenDevices] = useState<Set<string>>(new Set());
  const [todayTimeData, setTodayTimeData] = useState<Record<string, number | string>[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);

  const toggleDevice = useCallback((name: string) => {
    setHiddenDevices(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Refs для устройств — заполняются в loadDashboard, используются в loadBalanceAndKpi
  const sourceDeviceIdsRef = useRef<string[]>([]);
  const prodDevicesRef = useRef<DeviceInfo[]>([]);
  const domDevicesRef = useRef<DeviceInfo[]>([]);
  const selectedMonthRef = useRef<SelectedMonth>(selectedMonth);
  const staticDataLoadedRef = useRef(false);

  // ── Load balance + KPI for a given month ─────────────────────────────────

  const loadBalanceAndKpi = useCallback(async (year: number, month: number) => {
    setBalanceLoading(true);
    try {
      const monthStart = new Date(year, month, 1);
      // Используем локальный формат даты — toISOString() даёт UTC и сдвигает день в UTC+2/+3
      const pad = (n: number) => String(n).padStart(2, '0');
      const monthStartDate = `${year}-${pad(month + 1)}-01`;
      const nextYear  = month === 11 ? year + 1 : year;
      const nextMonth = month === 11 ? 1 : month + 2;
      const monthEndDate = `${nextYear}-${pad(nextMonth)}-01`;
      const monthStartTs = monthStart.toISOString(); // для baseline-запроса timestamp нужен как есть

      const { data: monthData } = await supabase
        .from('beliot_daily_readings_agg')
        .select('device_id, reading_day, min_value, max_value')
        .gte('reading_day', monthStartDate)
        .lt('reading_day', monthEndDate)
        .order('reading_day', { ascending: true });

      // Строим byDeviceDay из агрегированного view
      const byDeviceDay: Record<string, Record<string, MinMax>> = {};
      for (const r of monthData || []) {
        const day = String(r.reading_day);
        const did = r.device_id;
        if (!byDeviceDay[did]) byDeviceDay[did] = {};
        byDeviceDay[did][day] = { min: Number(r.min_value), max: Number(r.max_value) };
      }

      const sourceIds = sourceDeviceIdsRef.current;
      const prodDevs  = prodDevicesRef.current;
      const domDevs   = domDevicesRef.current;

      // Загружаем baseline (последнее показание до начала месяца) — нужно для day 1 и для KPI
      const allDeviceIds = [...new Set([
        ...sourceIds,
        ...prodDevs.map(d => d.device_id),
        ...domDevs.map(d => d.device_id),
      ])];
      const baselineByDevice: Record<string, number> = {};
      if (allDeviceIds.length > 0) {
        const { data: baselineData } = await supabase
          .from('beliot_device_readings')
          .select('device_id, reading_value')
          .in('device_id', allDeviceIds)
          .lt('reading_date', monthStartTs)
          .order('reading_date', { ascending: false })
          .limit(allDeviceIds.length * 10);
        for (const r of baselineData || []) {
          if (!(r.device_id in baselineByDevice)) {
            baselineByDevice[r.device_id] = Number(r.reading_value);
          }
        }
      }

      // Граф баланса: все дни месяца
      // Используем max[день] − max[предыдущий день] — работает и при одном, и при нескольких показаниях в сутки
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: BalanceDay[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        // Локальная дата строкой — без конвертации в UTC, чтобы не было сдвига в UTC+2/+3
        const dayStr  = `${year}-${pad(month + 1)}-${pad(d)}`;
        const label   = `${pad(d)}.${pad(month + 1)}`;

        const getDay = (did: string) => {
          const seg = byDeviceDay[did]?.[dayStr];
          if (!seg) return 0;
          // Предыдущий максимум: вчера из byDeviceDay или baseline (для 1-го числа)
          let prevMax: number;
          if (d === 1) {
            prevMax = baselineByDevice[did] ?? seg.min;
          } else {
            const prevDayStr = `${year}-${pad(month + 1)}-${pad(d - 1)}`;
            const prevSeg = byDeviceDay[did]?.[prevDayStr];
            prevMax = prevSeg ? prevSeg.max : (baselineByDevice[did] ?? seg.min);
          }
          return Math.max(0, parseFloat((seg.max - prevMax).toFixed(3)));
        };

        const srcTotal = sourceIds.reduce((s, did) => s + getDay(did), 0);
        const row: BalanceDay = { date: label, source: parseFloat(srcTotal.toFixed(3)), losses: 0 };
        let prodTotal = 0;

        // Группируем по имени объекта — суммируем счётчики одного объекта
        const prodByName: Record<string, number> = {};
        for (const dev of prodDevs) {
          prodByName[dev.name] = (prodByName[dev.name] ?? 0) + getDay(dev.device_id);
        }
        for (const [name, v] of Object.entries(prodByName)) {
          row[name] = parseFloat(v.toFixed(3));
          prodTotal += v;
        }
        const domByName: Record<string, number> = {};
        for (const dev of domDevs) {
          domByName[dev.name] = (domByName[dev.name] ?? 0) + getDay(dev.device_id);
        }
        for (const [name, v] of Object.entries(domByName)) {
          row[name] = parseFloat(v.toFixed(3));
        }
        row.losses = parseFloat(Math.max(0, srcTotal - prodTotal).toFixed(3));
        days.push(row);
      }

      // KPI: месячные итоги (max по месяцу − baseline до начала месяца)
      // baselineByDevice уже загружен выше — переиспользуем
      const monthByDevice: Record<string, MinMax> = {};
      for (const r of monthData || []) {
        const did = r.device_id;
        if (!monthByDevice[did]) monthByDevice[did] = { min: Infinity, max: -Infinity };
        monthByDevice[did].max = Math.max(monthByDevice[did].max, Number(r.max_value));
        monthByDevice[did].min = Math.min(monthByDevice[did].min, Number(r.min_value));
      }

      const monthConsumption = (ids: string[]) =>
        ids.reduce((s, id) => {
          const v = monthByDevice[id];
          if (!v || v.max === -Infinity) return s;
          const baseline = id in baselineByDevice ? baselineByDevice[id] : v.min;
          return s + Math.max(0, v.max - baseline);
        }, 0);

      const prodDeviceIds = prodDevs.map(d => d.device_id);
      const domDeviceIds  = domDevs.map(d => d.device_id);

      const sourceMonth     = parseFloat(monthConsumption(sourceIds).toFixed(2));
      const productionMonth = parseFloat(monthConsumption(prodDeviceIds).toFixed(2));
      const domesticMonth   = parseFloat(monthConsumption(domDeviceIds).toFixed(2));
      const lossesMonth     = parseFloat(Math.max(0, sourceMonth - productionMonth).toFixed(2));
      const lossesPct       = sourceMonth > 0 ? parseFloat(((lossesMonth / sourceMonth) * 100).toFixed(1)) : 0;

      setBalanceData(days);
      setKpi(prev => ({ ...prev, sourceMonth, productionMonth, domesticMonth, lossesMonth, lossesPct }));
    } catch (err) {
      console.error('[WaterDashboard] loadBalanceAndKpi error:', err);
    } finally {
      setBalanceLoading(false);
    }
  }, []);


  // ── Load main dashboard data ──────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [
        alertsRes,
        lastAnalysisRes,
        samplingPointsRes,
        deviceOverridesRes,
      ] = await Promise.all([
        supabase
          .from('water_quality_alerts')
          .select('id, priority, parameter_label, value, unit, deviation_percent, message, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('water_analysis')
          .select('sample_date')
          .order('sample_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('sampling_points')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('beliot_device_overrides')
          .select('device_id, name, object_name, device_role'),
      ]);

      // ── Карта устройств ──────────────────────────────────────────────────
      const overrides = deviceOverridesRes.data || [];
      const anyRole = overrides.some(d => d.device_role === 'source' || d.device_role === 'production');
      setHasRoles(anyRole);

      const devList: DeviceInfo[] = overrides.map(d => ({
        device_id: d.device_id,
        name: d.object_name || d.name || d.device_id,
        role: d.device_role as 'source' | 'production' | 'domestic' | null ?? null,
      }));


      const sourceDeviceIds = devList.filter(d => d.role === 'source').map(d => d.device_id);
      const prodDevices = anyRole
        ? devList.filter(d => d.role === 'production')
        : devList;
      const domDevices = anyRole ? devList.filter(d => d.role === 'domestic') : [];

      // Сохраняем в refs — loadBalanceAndKpi использует их без перезапроса
      sourceDeviceIdsRef.current = sourceDeviceIds;
      prodDevicesRef.current = prodDevices;
      domDevicesRef.current = domDevices;

      const activeAlerts = (alertsRes.data || []) as AlertItem[];
      const critCount = activeAlerts.filter(a => a.priority === 'critical').length;

      setProductionDeviceNames([...new Set(prodDevices.map(d => d.name))]);
      setDomesticDeviceNames([...new Set(domDevices.map(d => d.name))]);
      setAlerts(activeAlerts);
      setKpi(prev => ({
        ...prev,
        activeAlerts: activeAlerts.length,
        criticalAlerts: critCount,
        lastAnalysisDate: lastAnalysisRes.data?.sample_date || null,
        samplingPointsCount: samplingPointsRes.data?.length || 0,
      }));

      staticDataLoadedRef.current = true;
      await Promise.all([
        loadBalanceAndKpi(selectedMonthRef.current.year, selectedMonthRef.current.month),
        loadTodayReadings(prodDevices),
      ]);
    } catch (err) {
      console.error('[WaterDashboard] loadDashboard error:', err);
    } finally {
      setLoading(false);
    }
  // loadTodayReadings declared after this callback — safe because it runs on mount, not at definition time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBalanceAndKpi]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── Почасовые показания за сегодня по производственным счётчикам ──────────
  const loadTodayReadings = useCallback(async (prodDevs: DeviceInfo[]) => {
    if (prodDevs.length === 0) return;
    setTodayLoading(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
      const todayEnd   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:59:59`;

      const { data } = await supabase
        .from('beliot_device_readings')
        .select('device_id, reading_date, reading_value')
        .in('device_id', prodDevs.map(d => d.device_id))
        .gte('reading_date', todayStart)
        .lte('reading_date', todayEnd)
        .order('reading_date', { ascending: true });

      if (!data || data.length === 0) { setTodayTimeData([]); return; }

      // Для каждого device_id берём последнее показание в каждом часу
      const byDeviceHour: Record<string, Record<number, number>> = {};
      for (const r of data) {
        const h = new Date(r.reading_date).getHours();
        if (!byDeviceHour[r.device_id]) byDeviceHour[r.device_id] = {};
        byDeviceHour[r.device_id][h] = Number(r.reading_value);
      }

      // Baseline — первое показание дня по каждому устройству
      const baselineByDev: Record<string, number> = {};
      for (const r of data) {
        if (!(r.device_id in baselineByDev)) baselineByDev[r.device_id] = Number(r.reading_value);
      }

      // Строим точки по часам с нарастающим расходом от начала дня
      const maxHour = now.getHours();
      const points: Record<string, number | string>[] = [];
      for (let h = 0; h <= maxHour; h++) {
        const point: Record<string, number | string> = { time: `${pad(h)}:00` };
        for (const dev of prodDevs) {
          const hourVal = byDeviceHour[dev.device_id]?.[h];
          const base    = baselineByDev[dev.device_id] ?? 0;
          point[dev.name] = hourVal !== undefined
            ? parseFloat(Math.max(0, hourVal - base).toFixed(2))
            : (null as unknown as number);
        }
        points.push(point);
      }
      setTodayTimeData(points);
    } catch (err) {
      console.error('[WaterDashboard] loadTodayReadings error:', err);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  // Пересчёт баланса при смене выбранного месяца
  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
    if (staticDataLoadedRef.current) {
      loadBalanceAndKpi(selectedMonth.year, selectedMonth.month);
    }
  }, [selectedMonth, loadBalanceAndKpi]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('ru-RU'); } catch { return s; }
  };


  // ── Данные чарта с учётом скрытых серий ──────────────────────────────────
  // Обнуляем скрытые устройства прямо в данных — `hide` проп Bar не надёжен
  const visibleBalanceData = useMemo(() => {
    if (hiddenDevices.size === 0) return balanceData;
    return balanceData.map(row => {
      const r: BalanceDay = { ...row };
      for (const key of Object.keys(r)) {
        if (key !== 'date' && key !== 'source' && key !== 'losses' && hiddenDevices.has(key)) {
          r[key] = 0;
        }
      }
      if (hiddenDevices.has('__losses__')) r.losses = 0;
      return r;
    });
  }, [balanceData, hiddenDevices]);

  // ── Theoretical losses ────────────────────────────────────────────────────
  const theoreticalFilterLoss = parseFloat((kpi.sourceMonth * FILTER_LOSS_PER_M3).toFixed(2));
  const remainingLoss = parseFloat(Math.max(0, kpi.lossesMonth - theoreticalFilterLoss).toFixed(2));

  // ── Передаём KPI-контекст в AI-чат при изменении данных ──────────────────
  useEffect(() => {
    if (loading) return;
    const monthLabel = new Date(selectedMonth.year, selectedMonth.month)
      .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    setAIChatWaterContext({
      monthLabel,
      sourceMonth: kpi.sourceMonth,
      productionMonth: kpi.productionMonth,
      domesticMonth: kpi.domesticMonth,
      lossesMonth: kpi.lossesMonth,
      lossesPct: kpi.lossesPct,
      filterLoss: theoreticalFilterLoss,
      osmosisLoss: remainingLoss,
      activeAlerts: kpi.activeAlerts,
    });
    // Очищаем контекст при уходе с дашборда
    return () => setAIChatWaterContext(null);
  }, [kpi, selectedMonth, loading, theoreticalFilterLoss, remainingLoss]);

  // ── Domestic consumption by device name ───────────────────────────────────
  const domesticConsumptionByDevice = useMemo(() =>
    domesticDeviceNames
      .map((name, i) => ({
        name,
        color: DOM_COLORS[i % DOM_COLORS.length],
        total: parseFloat(
          balanceData.reduce((s, row) =>
            s + (typeof row[name] === 'number' ? (row[name] as number) : 0), 0
          ).toFixed(2)
        ),
      }))
      .sort((a, b) => b.total - a.total),
    [balanceData, domesticDeviceNames]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="wd-loading">
        <div className="wd-spinner" />
        <span>Загрузка дашборда...</span>
      </div>
    );
  }

  return (
    <div className="wd">

      {/* ── Предупреждение о ненастроенных ролях ───────────────────────── */}
      {!hasRoles && (
        <div className="wd-warning">
          ⚙️ Роли счётчиков не настроены. Откройте паспорт каждого устройства
          на вкладке «Счётчики воды» и установите роль:
          <strong> Источник (скважина)</strong>, <strong>Производство</strong> или{' '}
          <strong>Хоз-питьевое водоснабжение</strong>.
          Это необходимо для расчёта водного баланса.
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="wd-kpi-row">
        <div className="wd-kpi wd-kpi--blue">
          <div className="wd-kpi__icon">🚰</div>
          <div>
            <div className="wd-kpi__value">{kpi.sourceMonth.toLocaleString('ru-RU')} м³</div>
            <div className="wd-kpi__label">Скважина (вход), месяц</div>
          </div>
        </div>

        <div className="wd-kpi wd-kpi--teal">
          <div className="wd-kpi__icon">🏭</div>
          <div>
            <div className="wd-kpi__value">{kpi.productionMonth.toLocaleString('ru-RU')} м³</div>
            <div className="wd-kpi__label">Производство, месяц</div>
          </div>
        </div>

        <div className="wd-kpi wd-kpi--green">
          <div className="wd-kpi__icon">🏠</div>
          <div>
            <div className="wd-kpi__value">{kpi.domesticMonth.toLocaleString('ru-RU')} м³</div>
            <div className="wd-kpi__label">Хоз-питьевое, месяц</div>
          </div>
        </div>

        <div className={`wd-kpi ${kpi.lossesPct > 15 ? 'wd-kpi--red' : kpi.lossesPct > 8 ? 'wd-kpi--orange' : 'wd-kpi--green'}`}>
          <div className="wd-kpi__icon">💨</div>
          <div>
            <div className="wd-kpi__value">
              {kpi.lossesMonth.toLocaleString('ru-RU')} м³
              <span className="wd-kpi__pct"> ({kpi.lossesPct}%)</span>
            </div>
            <div className="wd-kpi__label">Потери воды, месяц</div>
          </div>
        </div>

        <div className="wd-kpi wd-kpi--orange">
          <div className="wd-kpi__icon">🔧</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="wd-kpi__label">Структура потерь</div>
            <div className="wd-kpi__split-row">
              <span>Промывка:</span>
              <strong>{theoreticalFilterLoss.toLocaleString('ru-RU')} м³</strong>
              <span className="wd-kpi__pct">({kpi.lossesMonth > 0 ? ((theoreticalFilterLoss / kpi.lossesMonth) * 100).toFixed(0) : 0}%)</span>
            </div>
            <div className="wd-kpi__split-row">
              <span>Осмос:</span>
              <strong>{remainingLoss.toLocaleString('ru-RU')} м³</strong>
              <span className="wd-kpi__pct">({kpi.lossesMonth > 0 ? ((remainingLoss / kpi.lossesMonth) * 100).toFixed(0) : 0}%)</span>
            </div>
          </div>
        </div>
      </div>


      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      <div className="wd-charts-row">

        {/* Balance Chart */}
        <div className="wd-card wd-card--consumption">
          <div className="wd-card__header">
            <h3>💧 Водный баланс — {new Date(selectedMonth.year, selectedMonth.month)
              .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
              .replace(/^./, c => c.toUpperCase())}</h3>
            <select
              className="wd-period-select"
              value={`${selectedMonth.year}-${selectedMonth.month}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setSelectedMonth({ year: y, month: m });
              }}
            >
              {Array.from({ length: 6 }, (_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                return { year: d.getFullYear(), month: d.getMonth() };
              }).map(({ year, month }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {new Date(year, month)
                    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
                    .replace(/^./, c => c.toUpperCase())}
                </option>
              ))}
            </select>
            {balanceLoading
              ? <span className="wd-card__hint">Загрузка...</span>
              : <span className="wd-card__hint">м³/сут</span>
            }
          </div>
          {balanceData.length > 0 ? (
            <div className="wd-balance-wrap">
              <div className="wd-balance-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={visibleBalanceData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      interval={4}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit=" м³" width={58} />
                    <Tooltip
                      formatter={(v: number | undefined, name: string | undefined) => {
                        const val = v ?? 0;
                        const label = name === 'source' ? 'Скважина' : name === 'losses' ? 'Потери' : (name ?? '');
                        return [`${val} м³`, label];
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    {/* Производственные счётчики */}
                    {productionDeviceNames.slice(0, 6).map((name, i) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="balance"
                        fill={PROD_COLORS[i % PROD_COLORS.length]}
                      />
                    ))}
                    {/* Хоз-питьевые счётчики */}
                    {domesticDeviceNames.map((name, i) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="balance"
                        fill={DOM_COLORS[i % DOM_COLORS.length]}
                      />
                    ))}
                    {/* Потери — красная зона */}
                    <Bar
                      dataKey="losses"
                      stackId="balance"
                      fill={LOSSES_COLOR}
                      fillOpacity={0.7}
                      radius={[3, 3, 0, 0]}
                    />
                    {/* Скважина — линия (суммарный вход) */}
                    <Line
                      type="monotone"
                      dataKey="source"
                      stroke={SOURCE_COLOR}
                      strokeWidth={2}
                      dot={{ r: 3, fill: SOURCE_COLOR }}
                      strokeDasharray="5 3"
                      hide={hiddenDevices.has('__source__')}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="wd-device-filter">
                {/* Скважина — переключаемая */}
                <button
                  className={`wd-device-filter__item${hiddenDevices.has('__source__') ? ' wd-device-filter__item--hidden' : ''}`}
                  onClick={() => toggleDevice('__source__')}
                  title={hiddenDevices.has('__source__') ? 'Показать' : 'Скрыть'}
                >
                  <span className="wd-device-filter__dot wd-device-filter__dot--line" style={{ background: SOURCE_COLOR }} />
                  <span className="wd-device-filter__name">Скважина</span>
                </button>
                {/* Потери — переключаемая */}
                <button
                  className={`wd-device-filter__item${hiddenDevices.has('__losses__') ? ' wd-device-filter__item--hidden' : ''}`}
                  onClick={() => toggleDevice('__losses__')}
                  title={hiddenDevices.has('__losses__') ? 'Показать' : 'Скрыть'}
                >
                  <span className="wd-device-filter__dot" style={{ background: LOSSES_COLOR }} />
                  <span className="wd-device-filter__name">Потери</span>
                </button>
                {/* Счётчики — объекты */}
                {[
                  ...productionDeviceNames.map((name, i) => ({ name, color: PROD_COLORS[i % PROD_COLORS.length] })),
                  ...domesticDeviceNames.map((name, i) => ({ name, color: DOM_COLORS[i % DOM_COLORS.length] })),
                ].map(({ name, color }) => (
                  <button
                    key={name}
                    className={`wd-device-filter__item${hiddenDevices.has(name) ? ' wd-device-filter__item--hidden' : ''}`}
                    onClick={() => toggleDevice(name)}
                    title={hiddenDevices.has(name) ? 'Показать' : 'Скрыть'}
                  >
                    <span className="wd-device-filter__dot" style={{ background: color }} />
                    <span className="wd-device-filter__name">{name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="wd-no-data">Нет данных по показаниям счётчиков за период</div>
          )}
        </div>

        {/* Почасовой расход производства за сегодня */}
        <div className="wd-card wd-card--prod-trend">
          <div className="wd-card__header">
            <h3>🏭 Производство сегодня</h3>
            <span className="wd-card__hint">нарастающий расход, м³</span>
          </div>
          {todayLoading ? (
            <div className="wd-no-data">Загрузка...</div>
          ) : todayTimeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={todayTimeData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} unit=" м³" width={58} />
                <Tooltip
                  formatter={(v: number | undefined, name: string | undefined) => [v != null ? `${v} м³` : '—', name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                {productionDeviceNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={PROD_COLORS[i % PROD_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="wd-no-data">Нет показаний за сегодня</div>
          )}
        </div>
      </div>

      {/* ── Domestic distribution ───────────────────────────────────────── */}
      {domesticConsumptionByDevice.length > 0 && (
        <div className="wd-card wd-card--domestic-dist">
          <div className="wd-card__header">
            <h3>🏠 Хоз-питьевое водоснабжение — распределение</h3>
            <span className="wd-card__hint">м³ за месяц</span>
          </div>
          <div className="wd-domestic-dist">
            {domesticConsumptionByDevice.map(item => {
              const pct = kpi.domesticMonth > 0 ? (item.total / kpi.domesticMonth) * 100 : 0;
              return (
                <div key={item.name} className="wd-domestic-dist__item">
                  <span className="wd-domestic-dist__name">{item.name}</span>
                  <div className="wd-domestic-dist__track">
                    <div
                      className="wd-domestic-dist__bar"
                      style={{ width: `${pct}%`, background: item.color }}
                    />
                  </div>
                  <span className="wd-domestic-dist__val">{item.total.toLocaleString('ru-RU')} м³</span>
                  <span className="wd-domestic-dist__pct">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      <div className="wd-card wd-card--alerts">
        <div className="wd-card__header">
          <h3>🚨 Активные превышения норм</h3>
          {alerts.length > 0 && (
            <span className="wd-alerts-count">{alerts.length}</span>
          )}
        </div>

        {alerts.length > 0 ? (
          <div className="wd-alerts-table-wrap">
            <table className="wd-alerts-table">
              <thead>
                <tr>
                  <th>Приоритет</th>
                  <th>Параметр</th>
                  <th>Значение</th>
                  <th>Превышение</th>
                  <th>Сообщение</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id} className={`wd-alert-row wd-alert-row--${a.priority}`}>
                    <td>
                      <span className="wd-alert-priority">
                        {PRIORITY_ICON[a.priority] || '⚪'}
                        <span className="wd-alert-priority__label">{a.priority}</span>
                      </span>
                    </td>
                    <td>{a.parameter_label}</td>
                    <td className="wd-alert-value">{a.value} {a.unit}</td>
                    <td>
                      {a.deviation_percent != null
                        ? <span className="wd-alert-deviation">+{Math.round(a.deviation_percent)}%</span>
                        : '—'}
                    </td>
                    <td className="wd-alert-msg">{a.message}</td>
                    <td className="wd-alert-date">{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="wd-no-alerts">
            ✅ Активных превышений норм нет
          </div>
        )}
      </div>


    </div>
  );
};

export default WaterDashboard;
