/**
 * WaterDashboard — главный дашборд раздела «Вода».
 *
 * Структура (Вариант 3 — Комбо):
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  KPI: скважина / производство / потери %                    │
 *  ├───────────────────────────────┬──────────────────────────────┤
 *  │  💧 Водный баланс 7 дней      │  🕸 Радар качества воды      │
 *  │  ComposedChart: стек+линия    │  (radar chart, % от нормы)   │
 *  ├───────────────────────────────┴──────────────────────────────┤
 *  │  🔢 Структура потерь (по счётчикам)                          │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Водный баланс:
 *  Производственные нужды = Σ расхода по счётчикам ЛУ/АЛПО/сортировка/очистное (группа «ХВО» без агрегата умягчения 11363).
 *  Потери по дням и KPI = Скважина (source) − эта сумма
 *
 * Структура потерь:
 *  Промывка (отмывка фильтров) = расход скважины − расход умягчённой воды (агрегат ХВО)
 *  Осмос = расход умягчённой − производственные нужды
 */

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
import type { MouseHandlerDataParam } from 'recharts';
import { supabase } from '@/shared/config/supabase';
import { setAIChatWaterContext } from '@/features/ai-consultant/events/chatEvents';
import {
  domesticBalanceLabelForDevice,
  FIRE_SUPPRESSION_DEVICE_IDS,
  FIRE_SUPPRESSION_DISPLAY_LABEL,
  HVO_AGGREGATE_WATER_DEVICE_IDS,
  getProductionNeedsKpiDeviceIds,
  mergeBeliotOverridesForDashboard,
} from '../constants/beliotDeviceRegistry';
import { buildMeterLabelColorMap } from '../constants/meterSeriesColors';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import './WaterDashboard.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type MinMax = { min: number; max: number };

/** На узком экране: короткое окно по умолчанию или прокручиваемый месяц */
type BalanceMobileRange = '7' | '14' | 'month';

interface SelectedMonth {
  year: number;
  month: number; // 0-based (как в Date)
}

type ProductionDaySummary = {
  summary_date: string; // YYYY-MM-DD
  total_m3: number;
  totals_by_name: Record<string, number>;
  work_hours_by_name: Record<string, number>;
};

interface DeviceInfo {
  device_id: string;
  name: string;
  address: string | null;
  role: 'source' | 'production' | 'domestic' | null;
}

interface MeterGroup {
  key: string;
  label: string;
  role: 'source' | 'production' | 'domestic';
  deviceIds: string[];
  isCombined: boolean;
}

interface KpiData {
  sourceMonth: number;       // м³ — скважина за месяц
  productionMonth: number;   // м³ — ЛУ+АЛПО+сортировка/очистное (ХВО без агрегата умягчения)
  domesticMonth: number;     // м³ — хоз-питьевое за месяц
  lossesMonth: number;       // м³ — потери = source − production
  lossesPct: number;         // % потерь
  /** Расход умягчённой воды (агрегат ХВО), м³ */
  softenedWaterMonth: number;
  lastAnalysisDate: string | null;
  samplingPointsCount: number;
}

interface BalanceDay {
  /** Число месяца (строка), ось X; месяц/год — в заголовке карточки и в тултипе */
  date: string;
  source: number;
  losses: number;
  [productionDevice: string]: number | string;
}

interface MonthlyMeterRow {
  key: string;
  label: string;
  role: 'source' | 'production' | 'domestic';
  currentMonth: number;
  averagePerDay: number;
  shareOfRole: number;
  isCombined: boolean;
  deviceCount: number;
  deviceIds: string[];
  /** Для вкладки «Производственные»: отдельные шкалы % для входа ХВО и внутренних счётчиков */
  distributionSection?: 'hvo_inlet' | 'internal';
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Цвет потерь */
const LOSSES_COLOR = '#ef4444';

/** Цвет скважины (источника) */
const SOURCE_COLOR = '#1e40af';

type ProductionTooltipPayloadEntry = {
  name?: string;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
  fill?: string;
};

type ProductionChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<ProductionTooltipPayloadEntry>;
  onClose: () => void;
};

function formatProductionTooltipValue(v: ProductionTooltipPayloadEntry['value']): string {
  if (v == null) return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return `${v} м³`;
  if (typeof v === 'string') return `${v} м³`;
  return '—';
}

/**
 * Подсказка графика «Производство»: рендерится через portal в контейнер прокрутки графика,
 * закрепляется сверху справа в видимой области окна графика.
 */
function ProductionChartTooltip({ active, label, payload, onClose }: ProductionChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;
  const title = label != null && label !== '' ? `Час ${label}` : 'Накопление';
  return (
    <div
      className="wd-prod-tooltip-panel"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={title}
    >
      <div className="wd-prod-tooltip-panel__head">
        <span className="wd-prod-tooltip-panel__title">{title}</span>
        <button
          type="button"
          className="wd-prod-tooltip-panel__close"
          aria-label="Закрыть"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>
      <ul className="wd-prod-tooltip-panel__list">
        {payload.map((entry, i) => {
          if (entry.name == null) return null;
          const c = entry.color ?? entry.fill ?? '#64748b';
          return (
            <li
              key={`${String(entry.name)}-${i}`}
              className="wd-prod-tooltip-panel__row"
              style={{ borderLeftColor: c }}
            >
              <span className="wd-prod-tooltip-panel__name">{entry.name}</span>
              <span className="wd-prod-tooltip-panel__val">{formatProductionTooltipValue(entry.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatBalanceChartTitle(dayLabel: string | number | undefined, selectedMonth: SelectedMonth): string {
  const d = parseInt(String(dayLabel), 10);
  if (!Number.isFinite(d) || d < 1) return String(dayLabel ?? '');
  const dt = new Date(selectedMonth.year, selectedMonth.month, d);
  return dt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function balanceChartSeriesLabel(name: string | undefined): string {
  if (name === 'source') return 'Скважина';
  if (name === 'losses') return 'Потери';
  return name ?? '';
}

/** Панель под графиком баланса: расход по счётчикам за выбранный день (тот же каркас, что у тултипа производства). */
function BalanceDockedDayPanel({
  label,
  payload,
  selectedMonth,
  onClose,
}: {
  label: string | number | undefined;
  payload: ReadonlyArray<ProductionTooltipPayloadEntry>;
  selectedMonth: SelectedMonth;
  onClose: () => void;
}): React.ReactNode {
  const title = formatBalanceChartTitle(label, selectedMonth);
  return (
    <div className="wd-balance-docked">
      <div
        className="wd-prod-tooltip-panel"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="wd-prod-tooltip-panel__head">
          <span className="wd-prod-tooltip-panel__title">{title}</span>
          <button
            type="button"
            className="wd-prod-tooltip-panel__close"
            aria-label="Закрыть"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>
        <ul className="wd-prod-tooltip-panel__list">
          {payload.map((entry, i) => {
            if (entry.name == null) return null;
            const c = entry.color ?? entry.fill ?? '#64748b';
            const seriesName = balanceChartSeriesLabel(String(entry.name));
            return (
              <li
                key={`${String(entry.name)}-${i}`}
                className="wd-prod-tooltip-panel__row"
                style={{ borderLeftColor: c }}
              >
                <span className="wd-prod-tooltip-panel__name">{seriesName}</span>
                <span className="wd-prod-tooltip-panel__val">{formatProductionTooltipValue(entry.value)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function balanceDockedTipFingerprint(
  label: string | number | undefined,
  list: ReadonlyArray<ProductionTooltipPayloadEntry>,
): string {
  return `${String(label)}|${list.map(e => `${String(e.name)}:${String(e.value)}`).join(';')}`;
}

/** Порядок серий как у ComposedChart баланса — для клика и синхронизации с фильтрами. */
function buildBalanceDockedTipFromRow(
  row: BalanceDay,
  productionDeviceNames: string[],
  domesticDeviceNames: string[],
  balanceMeterColorMap: Map<string, string>,
  hideSourceLine: boolean,
): { label: string | number | undefined; payload: ProductionTooltipPayloadEntry[] } {
  const payload: ProductionTooltipPayloadEntry[] = [];
  for (const name of productionDeviceNames) {
    const raw = row[name];
    const value = typeof raw === 'number' ? raw : 0;
    payload.push({
      name,
      value,
      fill: balanceMeterColorMap.get(name) ?? '#64748b',
    });
  }
  for (const name of domesticDeviceNames) {
    const raw = row[name];
    const value = typeof raw === 'number' ? raw : 0;
    payload.push({
      name,
      value,
      fill: balanceMeterColorMap.get(name) ?? '#64748b',
    });
  }
  payload.push({
    name: 'losses',
    value: row.losses,
    fill: LOSSES_COLOR,
  });
  if (!hideSourceLine) {
    payload.push({
      name: 'source',
      value: row.source,
      fill: SOURCE_COLOR,
      color: SOURCE_COLOR,
    });
  }
  return { label: row.date, payload };
}

/**
 * Recharts 3 отдаёт activeTooltipIndex строкой (например "3"), не number — иначе клик по графику не находит столбец.
 */
function balanceChartRowIndexFromPointerState(
  state: MouseHandlerDataParam,
  rows: BalanceDay[],
): number | undefined {
  const raw = state.activeTooltipIndex ?? state.activeIndex;
  if (raw != null && raw !== '') {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const i = Math.trunc(raw);
      if (i >= 0 && i < rows.length) return i;
    }
    if (typeof raw === 'string') {
      const i = Number.parseInt(raw, 10);
      if (Number.isFinite(i) && i >= 0 && i < rows.length) return i;
    }
  }
  const label = state.activeLabel;
  if (label != null && label !== '') {
    const j = rows.findIndex(r => String(r.date) === String(label));
    if (j >= 0) return j;
  }
  return undefined;
}

/**
 * Передаёт данные стандартного Tooltip Recharts в закреплённую панель (сам всплывающий слой скрыт).
 */
function BalanceTooltipToDockedRelay({
  active,
  label,
  payload,
  onRelay,
  dockDismissedRef,
  pinned,
}: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<ProductionTooltipPayloadEntry>;
  onRelay: (data: { label: string | number | undefined; payload: ReadonlyArray<ProductionTooltipPayloadEntry> } | null) => void;
  dockDismissedRef: React.MutableRefObject<boolean>;
  pinned: boolean;
}): null {
  const hasPayload = (payload?.length ?? 0) > 0;
  const effectiveActive = Boolean(active && hasPayload);
  useLayoutEffect(() => {
    if (!effectiveActive) {
      if (!pinned) {
        dockDismissedRef.current = false;
        onRelay(null);
      }
      return;
    }
    if (pinned) return;
    const list = payload ?? [];
    if (list.length === 0) {
      onRelay(null);
      return;
    }
    if (dockDismissedRef.current) return;
    onRelay({ label, payload: list });
  }, [effectiveActive, label, payload, onRelay, dockDismissedRef, pinned]);
  return null;
}

const ADMIN_BUILDING_ADDRESS = 'советская 2/1';

function isWeekday(year: number, month: number, day: number): boolean {
  const dayOfWeek = new Date(year, month, day).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function isPublicHoliday(month: number, day: number): boolean {
  const monthDay = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Set([
    '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
    '02-23',
    '03-08',
    '05-01',
    '05-09',
    '06-12',
    '11-04',
  ]).has(monthDay);
}

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Суммарный учёт на выходе ХВО (умягчённая вода); ЛУ/АЛПО/сортировка — ниже по трубопроводу */
function isHvoAggregateProductionMeter(device: DeviceInfo): boolean {
  if (HVO_AGGREGATE_WATER_DEVICE_IDS.has(device.device_id)) return true;
  return /умягч/i.test(device.name || '');
}

function filterProductionNeedDevices(devList: DeviceInfo[], anyRole: boolean): DeviceInfo[] {
  return anyRole
    ? devList.filter(d => d.role === 'production')
    : devList.filter(d => d.role !== 'source' && d.role !== 'domestic');
}

/** На графике баланса — только «листья», если есть агрегат ХВО и внутренние счётчики (без двойного столбца) */
function productionDevicesForBalanceChart(prodDevices: DeviceInfo[]): DeviceInfo[] {
  const agg = prodDevices.filter(isHvoAggregateProductionMeter);
  const leaf = prodDevices.filter(d => !isHvoAggregateProductionMeter(d));
  if (agg.length > 0 && leaf.length > 0) return leaf;
  return prodDevices;
}

function buildMeterGroups(devices: DeviceInfo[]): MeterGroup[] {
  return devices
    .filter((device): device is DeviceInfo & { role: 'source' | 'production' | 'domestic' } =>
      device.role === 'source' || device.role === 'production' || device.role === 'domestic')
    .reduce<MeterGroup[]>((groups, device) => {
      const normalizedAddress = normalizeAddress(device.address);
      const shouldCombine = normalizedAddress === ADMIN_BUILDING_ADDRESS;

      if (!shouldCombine) {
        groups.push({
          key: device.device_id,
          label: device.name,
          role: device.role,
          deviceIds: [device.device_id],
          isCombined: false,
        });
        return groups;
      }

      const existingGroup = groups.find(group => group.role === device.role && group.isCombined);

      if (existingGroup) {
        existingGroup.deviceIds.push(device.device_id);
        existingGroup.deviceIds.sort((a, b) => a.localeCompare(b));
        existingGroup.key = `combined:${device.role}:${existingGroup.deviceIds.join('|')}`;
        return groups;
      }

      groups.push({
        key: `combined:${device.role}:${device.device_id}`,
        label: 'Административное здание, Советская 2/1',
        role: device.role,
        deviceIds: [device.device_id],
        isCombined: true,
      });
      return groups;
    }, [])
    .sort((a, b) => {
      const roleOrder = ['source', 'production', 'domestic'];
      const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.label.localeCompare(b.label, 'ru');
    });
}

/**
 * Сдвоенное пожаротушение — одна строка в распределении и суммарный расход (без двух отдельных МWN).
 */
function mergeFireSuppressionDomesticGroups(groups: MeterGroup[]): MeterGroup[] {
  if (FIRE_SUPPRESSION_DEVICE_IDS.size === 0) return groups;

  const toMerge = groups.filter(
    g =>
      g.role === 'domestic' &&
      g.deviceIds.length > 0 &&
      g.deviceIds.every(id => FIRE_SUPPRESSION_DEVICE_IDS.has(id)),
  );
  const rest = groups.filter(
    g =>
      !(
        g.role === 'domestic' &&
        g.deviceIds.length > 0 &&
        g.deviceIds.every(id => FIRE_SUPPRESSION_DEVICE_IDS.has(id))
      ),
  );

  if (toMerge.length === 0) return groups;

  const allIds = [...new Set(toMerge.flatMap(g => g.deviceIds))].sort((a, b) => a.localeCompare(b));
  const merged: MeterGroup = {
    key: 'combined:domestic:fire-suppression',
    label: FIRE_SUPPRESSION_DISPLAY_LABEL,
    role: 'domestic',
    deviceIds: allIds,
    isCombined: allIds.length > 1,
  };

  return [...rest, merged].sort((a, b) => {
    const roleOrder = ['source', 'production', 'domestic'];
    const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.label.localeCompare(b.label, 'ru');
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const WaterDashboard: React.FC = () => {
  const { isMobile } = useDeviceDetection();
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [loading, setLoading] = useState(true);
  const [distributionRole, setDistributionRole] = useState<'production' | 'domestic'>('production');
  /** Отдельный экран: меньше вертикальной прокрутки, шрифты не ужимаем */
  const [dashboardView, setDashboardView] = useState<'charts' | 'distribution'>('charts');
  const [workDayStats, setWorkDayStats] = useState({ production: 0, domestic: 0 });
  const [kpi, setKpi] = useState<KpiData>({
    sourceMonth: 0,
    productionMonth: 0,
    domesticMonth: 0,
    lossesMonth: 0,
    lossesPct: 0,
    softenedWaterMonth: 0,
    lastAnalysisDate: null,
    samplingPointsCount: 0,
  });
  const [balanceData, setBalanceData] = useState<BalanceDay[]>([]);
  const [productionDeviceNames, setProductionDeviceNames] = useState<string[]>([]);
  const [domesticDeviceNames, setDomesticDeviceNames] = useState<string[]>([]);
  const [monthlyMeterRows, setMonthlyMeterRows] = useState<MonthlyMeterRow[]>([]);
  const [hasRoles, setHasRoles] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [hiddenDevices, setHiddenDevices] = useState<Set<string>>(new Set());
  const [balanceMobileRange, setBalanceMobileRange] = useState<BalanceMobileRange>('7');
  const [todayTimeData, setTodayTimeData] = useState<Record<string, number | string>[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [productionTodayTotalM3, setProductionTodayTotalM3] = useState<number>(0);
  const [productionTodayWorkHoursByName, setProductionTodayWorkHoursByName] = useState<Record<string, number>>({});
  /** Накопление м³ с начала суток по каждому учёту — на момент последних данных (текущий час для «сегодня») */
  const [productionTodayM3ByName, setProductionTodayM3ByName] = useState<Record<string, number>>({});
  const [selectedProductionDay, setSelectedProductionDay] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [productionHistoryByDay, setProductionHistoryByDay] = useState<Record<string, ProductionDaySummary>>({});
  /** Скрытие крестиком: до следующего тапа по области графика */
  const [productionTooltipDismissed, setProductionTooltipDismissed] = useState(false);
  const [balanceDockedTip, setBalanceDockedTip] = useState<{
    label: string | number | undefined;
    payload: ReadonlyArray<ProductionTooltipPayloadEntry>;
  } | null>(null);
  const balanceDockDismissedRef = useRef(false);
  const balanceDockedRelayFpRef = useRef<string | null>(null);
  /** Клик по столбцу: панель под графиком не следует курсору, пока не повторный клик / крестик / смена периода. */
  const [balanceDockPinned, setBalanceDockPinned] = useState(false);

  useEffect(() => {
    setProductionTooltipDismissed(false);
  }, [selectedProductionDay, todayTimeData]);

  const prodChartScrollViewportRef = useRef<HTMLDivElement>(null);
  const [productionChartTooltipPortalHost, setProductionChartTooltipPortalHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (dashboardView !== 'charts' || todayLoading || todayTimeData.length === 0) {
      setProductionChartTooltipPortalHost(null);
      return;
    }
    setProductionChartTooltipPortalHost(prodChartScrollViewportRef.current);
  }, [dashboardView, todayLoading, todayTimeData.length]);

  useLayoutEffect(() => {
    const onResize = (): void => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const meterGroupsRef = useRef<MeterGroup[]>([]);
  const selectedMonthRef = useRef<SelectedMonth>(selectedMonth);
  const staticDataLoadedRef = useRef(false);

  // ── Load balance + KPI for a given month ─────────────────────────────────

  const loadBalanceAndKpi = useCallback(async (year: number, month: number) => {
    setBalanceLoading(true);
    try {
      const prevMonthStart = new Date(year, month - 1, 1);
      // Используем локальный формат даты — toISOString() даёт UTC и сдвигает день в UTC+2/+3
      const pad = (n: number) => String(n).padStart(2, '0');
      const prevMonthStartDate = `${prevMonthStart.getFullYear()}-${pad(prevMonthStart.getMonth() + 1)}-01`;
      const monthStartDate = `${year}-${pad(month + 1)}-01`;
      const nextYear  = month === 11 ? year + 1 : year;
      const nextMonth = month === 11 ? 1 : month + 2;
      const monthEndDate = `${nextYear}-${pad(nextMonth)}-01`;
      const prevMonthStartTs = prevMonthStart.toISOString();

      const { data: monthData } = await supabase
        .from('beliot_daily_readings_agg')
        .select('device_id, reading_day, min_value, max_value')
        .gte('reading_day', prevMonthStartDate)
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
      const meterGroups = meterGroupsRef.current;

      const aggDevs = prodDevs.filter(isHvoAggregateProductionMeter);
      const leafDevs = prodDevs.filter(d => !isHvoAggregateProductionMeter(d));
      const aggIds = aggDevs.map(d => d.device_id);
      const kpiIdsFromRegistry = getProductionNeedsKpiDeviceIds();
      const productionNeedsIds =
        kpiIdsFromRegistry.length > 0 ? kpiIdsFromRegistry : prodDevs.map(d => d.device_id);

      // Загружаем baseline до прошлого месяца — этого хватит и для прошлого, и для текущего месяца
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
          .lt('reading_date', prevMonthStartTs)
          .order('reading_date', { ascending: false })
          .limit(allDeviceIds.length * 10);
        for (const r of baselineData || []) {
          if (!(r.device_id in baselineByDevice)) {
            baselineByDevice[r.device_id] = Number(r.reading_value);
          }
        }
      }

      const prevMonthByDevice: Record<string, MinMax> = {};
      const currentMonthByDevice: Record<string, MinMax> = {};
      for (const r of monthData || []) {
        const day = String(r.reading_day);
        const did = r.device_id;
        const target = day >= monthStartDate ? currentMonthByDevice : prevMonthByDevice;
        if (!target[did]) target[did] = { min: Infinity, max: -Infinity };
        target[did].max = Math.max(target[did].max, Number(r.max_value));
        target[did].min = Math.min(target[did].min, Number(r.min_value));
      }

      const monthBaselineByDevice: Record<string, number> = {};
      for (const id of allDeviceIds) {
        const prevMonthStats = prevMonthByDevice[id];
        if (prevMonthStats && prevMonthStats.max !== -Infinity) {
          monthBaselineByDevice[id] = prevMonthStats.max;
        } else if (id in baselineByDevice) {
          monthBaselineByDevice[id] = baselineByDevice[id];
        }
      }

      // Граф баланса: все дни месяца
      // Используем max[день] − max[предыдущий день] — работает и при одном, и при нескольких показаниях в сутки
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: BalanceDay[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        // Локальная дата строкой — без конвертации в UTC, чтобы не было сдвига в UTC+2/+3
        const dayStr  = `${year}-${pad(month + 1)}-${pad(d)}`;
        /** Подпись на оси X — только число месяца (месяц в заголовке карточки) */
        const label   = String(d);

        const getDay = (did: string) => {
          const seg = byDeviceDay[did]?.[dayStr];
          if (!seg) return 0;
          // Предыдущий максимум: вчера из byDeviceDay или baseline (для 1-го числа)
          let prevMax: number;
          if (d === 1) {
            prevMax = monthBaselineByDevice[did] ?? seg.min;
          } else {
            const prevDayStr = `${year}-${pad(month + 1)}-${pad(d - 1)}`;
            const prevSeg = byDeviceDay[did]?.[prevDayStr];
            prevMax = prevSeg ? prevSeg.max : (monthBaselineByDevice[did] ?? seg.min);
          }
          return Math.max(0, parseFloat((seg.max - prevMax).toFixed(3)));
        };

        const srcTotal = sourceIds.reduce((s, did) => s + getDay(did), 0);
        const row: BalanceDay = { date: label, source: parseFloat(srcTotal.toFixed(3)), losses: 0 };

        const prodByName: Record<string, number> = {};
        if (aggDevs.length > 0) {
          for (const dev of aggDevs) {
            const v = getDay(dev.device_id);
            prodByName[dev.name] = (prodByName[dev.name] ?? 0) + v;
          }
          if (leafDevs.length > 0) {
            for (const dev of leafDevs) {
              const v = getDay(dev.device_id);
              prodByName[dev.name] = (prodByName[dev.name] ?? 0) + v;
            }
          }
        } else {
          for (const dev of prodDevs) {
            const v = getDay(dev.device_id);
            prodByName[dev.name] = (prodByName[dev.name] ?? 0) + v;
          }
        }
        const prodTotalForLoss = productionNeedsIds.reduce((s, id) => s + getDay(id), 0);
        for (const [name, v] of Object.entries(prodByName)) {
          row[name] = parseFloat(v.toFixed(3));
        }
        const domByName: Record<string, number> = {};
        for (const dev of domDevs) {
          const rowKey = domesticBalanceLabelForDevice(dev.device_id, dev.name);
          domByName[rowKey] = (domByName[rowKey] ?? 0) + getDay(dev.device_id);
        }
        for (const [name, v] of Object.entries(domByName)) {
          row[name] = parseFloat(v.toFixed(3));
        }
        row.losses = parseFloat(Math.max(0, srcTotal - prodTotalForLoss).toFixed(3));
        days.push(row);
      }

      // KPI: месячные итоги (max по месяцу − baseline до начала месяца)
      const monthConsumption = (ids: string[], byDevice: Record<string, MinMax>, baseline: Record<string, number>) =>
        ids.reduce((s, id) => {
          const v = byDevice[id];
          if (!v || v.max === -Infinity) return s;
          const base = id in baseline ? baseline[id] : v.min;
          return s + Math.max(0, v.max - base);
        }, 0);

      const domDeviceIds = domDevs.map(d => d.device_id);

      const sourceMonth = parseFloat(monthConsumption(sourceIds, currentMonthByDevice, monthBaselineByDevice).toFixed(2));
      const aggMonthTotal =
        aggIds.length > 0
          ? monthConsumption(aggIds, currentMonthByDevice, monthBaselineByDevice)
          : 0;
      const productionMonth = parseFloat(
        monthConsumption(productionNeedsIds, currentMonthByDevice, monthBaselineByDevice).toFixed(2),
      );
      const domesticMonth = parseFloat(monthConsumption(domDeviceIds, currentMonthByDevice, monthBaselineByDevice).toFixed(2));
      const lossesMonth     = parseFloat(Math.max(0, sourceMonth - productionMonth).toFixed(2));
      const lossesPct       = sourceMonth > 0 ? parseFloat(((lossesMonth / sourceMonth) * 100).toFixed(1)) : 0;
      const softenedWaterMonth = parseFloat(aggMonthTotal.toFixed(2));

      const roleTotals: Record<'source' | 'production' | 'domestic', number> = {
        source: sourceMonth,
        production: productionMonth,
        domestic: domesticMonth,
      };
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
      const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
      const observedDays = days.slice(0, elapsedDays);
      const productionStartIndex = observedDays.findIndex(row => row.source > 0);
      const productionWorkingDays = observedDays.reduce((count, row, index) => {
        const dayNumber = index + 1;
        const hasStarted = productionStartIndex !== -1 && index >= productionStartIndex;
        if (!hasStarted) return count;

        const scheduledWorkday = isWeekday(year, month, dayNumber) && !isPublicHoliday(month, dayNumber);
        const actualSourceWorkday = row.source > 0;
        return count + (scheduledWorkday || actualSourceWorkday ? 1 : 0);
      }, 0);
      const domesticWorkingDays = observedDays.reduce((count, _row, index) => {
        const dayNumber = index + 1;
        return count + (isWeekday(year, month, dayNumber) && !isPublicHoliday(month, dayNumber) ? 1 : 0);
      }, 0);
      const monthlyRows = meterGroups
        .map<MonthlyMeterRow>(group => {
          const currentMonthValue = monthConsumption(group.deviceIds, currentMonthByDevice, monthBaselineByDevice);
          const roleTotal = roleTotals[group.role];
          let shareOfRole = roleTotal > 0 ? parseFloat(((currentMonthValue / roleTotal) * 100).toFixed(1)) : 0;
          let distributionSection: MonthlyMeterRow['distributionSection'];
          if (group.role === 'production') {
            const groupHasAgg = group.deviceIds.some(id => aggIds.includes(id));
            distributionSection = groupHasAgg ? 'hvo_inlet' : 'internal';
            const denom = groupHasAgg ? aggMonthTotal : productionMonth;
            shareOfRole = denom > 0 ? parseFloat(((currentMonthValue / denom) * 100).toFixed(1)) : 0;
          }
          return {
            key: group.key,
            label: group.label,
            role: group.role,
            currentMonth: parseFloat(currentMonthValue.toFixed(2)),
            averagePerDay: elapsedDays > 0 ? parseFloat((currentMonthValue / elapsedDays).toFixed(2)) : 0,
            shareOfRole,
            isCombined: group.isCombined,
            deviceCount: group.deviceIds.length,
            deviceIds: [...group.deviceIds],
            distributionSection,
          };
        })
        .sort((a, b) => {
          if (a.role === 'production' && b.role === 'production') {
            const sa = a.distributionSection === 'hvo_inlet' ? 0 : 1;
            const sb = b.distributionSection === 'hvo_inlet' ? 0 : 1;
            if (sa !== sb) return sa - sb;
          }
          return b.currentMonth - a.currentMonth;
        });

      setBalanceData(days);
      setWorkDayStats({ production: productionWorkingDays, domestic: domesticWorkingDays });
      setMonthlyMeterRows(monthlyRows);
      setKpi(prev => ({
        ...prev,
        sourceMonth,
        productionMonth,
        domesticMonth,
        lossesMonth,
        lossesPct,
        softenedWaterMonth,
      }));
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
        lastAnalysisRes,
        samplingPointsRes,
        deviceOverridesRes,
      ] = await Promise.all([
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
          .select('device_id, name, object_name, address, device_role'),
      ]);

      // ── Карта устройств ──────────────────────────────────────────────────
      const overrides = mergeBeliotOverridesForDashboard(deviceOverridesRes.data || []);
      const anyRole = overrides.some(d => d.device_role === 'source' || d.device_role === 'production');
      setHasRoles(anyRole);

      const devList: DeviceInfo[] = overrides.map(d => ({
        device_id: d.device_id,
        name: d.object_name || d.name || d.device_id,
        address: d.address || null,
        role: (d.device_role as DeviceInfo['role']) ?? null,
      }));


      const sourceDeviceIds = devList.filter(d => d.role === 'source').map(d => d.device_id);
      const prodDevices = filterProductionNeedDevices(devList, anyRole);
      const domDevices = anyRole ? devList.filter(d => d.role === 'domestic') : [];

      // Сохраняем в refs — loadBalanceAndKpi использует их без перезапроса
      sourceDeviceIdsRef.current = sourceDeviceIds;
      prodDevicesRef.current = prodDevices;
      domDevicesRef.current = domDevices;
      meterGroupsRef.current = mergeFireSuppressionDomesticGroups(
        buildMeterGroups([
          ...devList.filter(d => d.role === 'source'),
          ...prodDevices,
          ...domDevices,
        ]),
      );

      const chartProd = productionDevicesForBalanceChart(prodDevices);
      setProductionDeviceNames([...new Set(chartProd.map(d => d.name))]);
      setDomesticDeviceNames([
        ...new Set(domDevices.map(d => domesticBalanceLabelForDevice(d.device_id, d.name))),
      ]);
      setKpi(prev => ({
        ...prev,
        lastAnalysisDate: lastAnalysisRes.data?.sample_date || null,
        samplingPointsCount: samplingPointsRes.data?.length || 0,
      }));

      staticDataLoadedRef.current = true;
      const prodForToday = chartProd.length > 0 ? chartProd : prodDevices;
      await Promise.all([
        loadBalanceAndKpi(selectedMonthRef.current.year, selectedMonthRef.current.month),
        loadProductionHistory(),
        loadProductionDayReadings(selectedProductionDay, prodForToday),
      ]);
    } catch (err) {
      console.error('[WaterDashboard] loadDashboard error:', err);
    } finally {
      setLoading(false);
    }
  // loadProductionDayReadings declared after this callback — safe because it runs on mount, not at definition time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBalanceAndKpi]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const productionDayOptions = useMemo(() => {
    const out: Array<{ ymd: string; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 31; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayOfWeek = d.getDay(); // 0=Sun
      // "рабочий день" — показываем только пн-пт
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
      out.push({ ymd, label });
    }
    return out;
  }, []);

  // ── Почасовые показания производства за выбранный день ────────────────────
  const loadProductionDayReadings = useCallback(async (dayYmd: string, prodDevs: DeviceInfo[]) => {
    if (prodDevs.length === 0) return;
    setTodayLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const [yy, mm, dd] = dayYmd.split('-').map(Number);
      const startLocal = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
      const endLocal = new Date(yy, mm - 1, dd, 23, 59, 59, 999);
      const startIso = startLocal.toISOString();
      const endIso = endLocal.toISOString();
      const isToday =
        (() => {
          const now = new Date();
          return now.getFullYear() === yy && now.getMonth() === mm - 1 && now.getDate() === dd;
        })();

      const { data } = await supabase
        .from('beliot_device_readings')
        .select('device_id, reading_date, reading_value')
        .in('device_id', prodDevs.map(d => d.device_id))
        .gte('reading_date', startIso)
        .lte('reading_date', endIso)
        .order('reading_date', { ascending: true });

      if (!data || data.length === 0) {
        setTodayTimeData([]);
        setProductionTodayTotalM3(0);
        setProductionTodayWorkHoursByName({});
        setProductionTodayM3ByName({});
        return;
      }

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

      // Прошедшие дни — полные сутки 0–23 ч; выбранный «сегодня» — только до текущего часа включительно.
      const maxHour = isToday ? new Date().getHours() : 23;
      const EPS = 0.0001;
      const points: Record<string, number | string>[] = [];

      // "Рабочий час" = за этот час появилось приращение (inc > 0).
      // Для отсутствующих часов используем carry-forward текущего накопления,
      // как это визуально делает `connectNulls`.
      const workHoursByName: Record<string, number> = {};
      const prevCumByName: Record<string, number> = {};
      const lastCumByName: Record<string, number> = {};

      for (const dev of prodDevs) {
        workHoursByName[dev.name] = 0;
        prevCumByName[dev.name] = 0;
        lastCumByName[dev.name] = 0;
      }

      for (let h = 0; h <= maxHour; h++) {
        const point: Record<string, number | string> = { time: `${pad(h)}:00` };

        for (const dev of prodDevs) {
          const hourVal = byDeviceHour[dev.device_id]?.[h];
          const base    = baselineByDev[dev.device_id] ?? 0;

          let cum = lastCumByName[dev.name] ?? 0;
          if (hourVal !== undefined) {
            cum = parseFloat(Math.max(0, hourVal - base).toFixed(2));
            point[dev.name] = cum;
          } else {
            point[dev.name] = null as unknown as number;
          }

          const inc = cum - (prevCumByName[dev.name] ?? 0);
          if (inc > EPS) {
            workHoursByName[dev.name] += 1;
          }

          prevCumByName[dev.name] = cum;
          lastCumByName[dev.name] = cum;
        }
        points.push(point);
      }

      const productionTodayTotal = prodDevs.reduce(
        (sum, d) => sum + (lastCumByName[d.name] ?? 0),
        0,
      );

      setTodayTimeData(points);
      setProductionTodayTotalM3(parseFloat(productionTodayTotal.toFixed(2)));
      setProductionTodayWorkHoursByName(workHoursByName);

      const totalsByName: Record<string, number> = {};
      for (const dev of prodDevs) {
        totalsByName[dev.name] = parseFloat((lastCumByName[dev.name] ?? 0).toFixed(2));
      }
      setProductionTodayM3ByName({ ...totalsByName });

      // Сохраняем историю (upsert) — чтобы постепенно набрать последний месяц
      // (требует прав администратора по RLS).
      const summaryRow: ProductionDaySummary = {
        summary_date: dayYmd,
        total_m3: parseFloat(productionTodayTotal.toFixed(2)),
        totals_by_name: totalsByName,
        work_hours_by_name: workHoursByName,
      };
      setProductionHistoryByDay(prev => ({ ...prev, [dayYmd]: summaryRow }));
      await supabase
        .from('water_production_day_summaries')
        .upsert(summaryRow, { onConflict: 'summary_date' });
    } catch (err) {
      console.error('[WaterDashboard] loadProductionDayReadings error:', err);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadProductionHistory = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31, 0, 0, 0, 0).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    const { data } = await supabase
      .from('water_production_day_summaries')
      .select('summary_date, total_m3, totals_by_name, work_hours_by_name')
      .gte('summary_date', start.slice(0, 10))
      .lte('summary_date', end.slice(0, 10))
      .order('summary_date', { ascending: false });

    const map: Record<string, ProductionDaySummary> = {};
    for (const r of (data as any[]) || []) {
      map[String(r.summary_date)] = {
        summary_date: String(r.summary_date),
        total_m3: Number(r.total_m3),
        totals_by_name: (r.totals_by_name || {}) as Record<string, number>,
        work_hours_by_name: (r.work_hours_by_name || {}) as Record<string, number>,
      };
    }
    setProductionHistoryByDay(map);
  }, []);

  // Пересчёт баланса при смене выбранного месяца
  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
    if (staticDataLoadedRef.current) {
      loadBalanceAndKpi(selectedMonth.year, selectedMonth.month);
    }
  }, [selectedMonth, loadBalanceAndKpi]);

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  /** Для текущего месяца — только дни до сегодня включительно (без «пустых» будущих суток на графике) */
  const balanceElapsedDayCount = useMemo(() => {
    const now = new Date();
    const { year, month } = selectedMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
    return isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  }, [selectedMonth]);

  const visibleBalanceDataElapsed = useMemo(
    () => visibleBalanceData.slice(0, balanceElapsedDayCount),
    [visibleBalanceData, balanceElapsedDayCount],
  );

  /** Как в CSS `.wd-charts-row`: при ширине <900px графики в колонку (высоты чартов) */
  const stacksChartsVertically = viewportSize.width < 900;

  /**
   * Окно 7/14 дней — только при узком viewport (<768).
   * На десктопе график всегда по **всем дням календаря месяца** (не обрезка «до сегодня»): иначе при текущем
   * месяце на оси только 1…N, что выглядит как «семь дней».
   */
  const balanceNarrowPhoneLayout = viewportSize.width < 768;

  /**
   * Десктоп / узкий «Месяц»: полный месяц из visibleBalanceData.
   * Узкий 7/14 дн.: только прошедшие сутки — для среза «последних 7/14».
   */
  const balanceChartBaseData = useMemo(() => {
    if (!balanceNarrowPhoneLayout) {
      return visibleBalanceData;
    }
    if (balanceMobileRange === 'month') {
      return visibleBalanceData;
    }
    return visibleBalanceDataElapsed;
  }, [balanceNarrowPhoneLayout, balanceMobileRange, visibleBalanceData, visibleBalanceDataElapsed]);

  const balanceChartDisplayData = useMemo(() => {
    const data = balanceChartBaseData;
    if (!balanceNarrowPhoneLayout || balanceMobileRange === 'month') {
      return data;
    }
    const windowDays = balanceMobileRange === '7' ? 7 : 14;
    if (data.length <= windowDays) return data;
    return data.slice(-windowDays);
  }, [balanceChartBaseData, balanceNarrowPhoneLayout, balanceMobileRange]);

  useEffect(() => {
    balanceDockDismissedRef.current = false;
    balanceDockedRelayFpRef.current = null;
    setBalanceDockPinned(false);
    setBalanceDockedTip(null);
  }, [selectedMonth, balanceChartDisplayData, balanceMobileRange]);

  const onBalanceDockRelay = useCallback(
    (data: { label: string | number | undefined; payload: ReadonlyArray<ProductionTooltipPayloadEntry> } | null) => {
      if (balanceDockPinned) return;
      if (data == null) {
        balanceDockedRelayFpRef.current = null;
        setBalanceDockedTip(null);
        return;
      }
      const fp = balanceDockedTipFingerprint(data.label, data.payload);
      if (fp === balanceDockedRelayFpRef.current) return;
      balanceDockedRelayFpRef.current = fp;
      setBalanceDockedTip(data);
    },
    [balanceDockPinned],
  );

  /** Пока день не закреплён — убрать панель, если курсор ушёл с графика и блока детализации (нет «выделения» столбца). */
  const onBalanceChartColPointerLeave = useCallback(() => {
    if (balanceDockPinned) return;
    balanceDockDismissedRef.current = false;
    balanceDockedRelayFpRef.current = null;
    setBalanceDockedTip(null);
  }, [balanceDockPinned]);

  const balanceChartPixelWidth = useMemo(() => {
    const n = balanceChartDisplayData.length;
    if (n === 0) return 320;
    if (balanceNarrowPhoneLayout && balanceMobileRange === 'month') {
      return Math.max(320, n * 26);
    }
    return 320;
  }, [balanceChartDisplayData.length, balanceNarrowPhoneLayout, balanceMobileRange]);

  /** Десктоп: подпись через день (interval 1), точная дата в тултипе; узкий экран — своя сетка */
  const balanceXAxisInterval = useMemo(() => {
    if (!balanceNarrowPhoneLayout) {
      return 1;
    }
    const n = balanceChartDisplayData.length;
    if (n <= 7) return 0;
    if (n <= 14) return 1;
    return 2;
  }, [balanceChartDisplayData.length, balanceNarrowPhoneLayout]);

  /** Горизонтальные подписи (без angle / без наклона) */
  const balanceXAxisTick = { fontSize: 11, fill: '#4b5563' };

  const balanceBarMaxSize = useMemo(() => {
    if (!balanceNarrowPhoneLayout) return undefined;
    const n = balanceChartDisplayData.length;
    if (n <= 7) return 44;
    if (n <= 14) return 34;
    return 20;
  }, [balanceNarrowPhoneLayout, balanceChartDisplayData.length]);

  const chartLayoutBand = useMemo((): 'compact' | 'medium' | 'relaxed' => {
    const h = viewportSize.height;
    if (stacksChartsVertically) {
      if (h < 760) return 'compact';
      if (h < 940) return 'medium';
      return 'relaxed';
    }
    if (h < 700) return 'compact';
    if (h < 860) return 'medium';
    return 'relaxed';
  }, [viewportSize.height, stacksChartsVertically]);

  const BALANCE_CHART_SHRINK_PX = 6;
  const PROD_CHART_SHRINK_PX = 6;

  const balanceChartInnerHeight = useMemo(() => {
    let h: number;
    if (stacksChartsVertically) {
      switch (chartLayoutBand) {
        case 'compact':
          h = 124;
          break;
        case 'medium':
          h = 152;
          break;
        default:
          h = 182;
      }
    } else {
      switch (chartLayoutBand) {
        case 'compact':
          h = 136;
          break;
        case 'medium':
          h = 164;
          break;
        default:
          h = 192;
      }
    }
    return Math.max(110, h - BALANCE_CHART_SHRINK_PX);
  }, [chartLayoutBand, stacksChartsVertically]);

  const productionChartInnerHeight = useMemo(() => {
    let h: number;
    if (isMobile) {
      if (stacksChartsVertically) {
        switch (chartLayoutBand) {
          case 'compact':
            h = 156;
            break;
          case 'medium':
            h = 180;
            break;
          default:
            h = 208;
        }
      } else {
        switch (chartLayoutBand) {
          case 'compact':
            h = 168;
            break;
          case 'medium':
            h = 192;
            break;
          default:
            h = 220;
        }
      }
    } else if (stacksChartsVertically) {
      switch (chartLayoutBand) {
        case 'compact':
          h = 168;
          break;
        case 'medium':
          h = 192;
          break;
        default:
          h = 220;
      }
    } else {
      switch (chartLayoutBand) {
        case 'compact':
          h = 182;
          break;
        case 'medium':
          h = 206;
          break;
        default:
          h = 232;
      }
    }
    return Math.max(140, h - PROD_CHART_SHRINK_PX);
  }, [chartLayoutBand, isMobile, stacksChartsVertically]);

  const balanceChartMargin = useMemo(
    () =>
      chartLayoutBand === 'compact'
        ? { top: 2, right: 6, left: 0, bottom: 2 }
        : { top: 4, right: 8, left: 0, bottom: 4 },
    [chartLayoutBand],
  );

  /** Низкий bottom обрезает подписи часов (XAxis + tickMargin); на compact держать около 32px */
  const productionChartMargin = useMemo(
    () =>
      chartLayoutBand === 'compact'
        ? { top: 4, right: 8, left: 0, bottom: 32 }
        : chartLayoutBand === 'medium'
          ? { top: 6, right: 10, left: 0, bottom: 28 }
          : { top: 8, right: 12, left: 0, bottom: 30 },
    [chartLayoutBand],
  );

  /** Производство: полные сутки (0–23 ч); ширина области скролла — по числу точек */
  const productionChartScrollWidth = useMemo(() => {
    const n = todayTimeData.length;
    if (n === 0) return 320;
    let pxPerHour: number;
    if (isMobile) {
      pxPerHour = chartLayoutBand === 'compact' ? 28 : chartLayoutBand === 'medium' ? 31 : 34;
    } else {
      pxPerHour = chartLayoutBand === 'compact' ? 32 : chartLayoutBand === 'medium' ? 36 : 40;
    }
    if (stacksChartsVertically) {
      pxPerHour = Math.max(26, pxPerHour - 3);
    }
    return Math.max(320, n * pxPerHour);
  }, [todayTimeData.length, isMobile, chartLayoutBand, stacksChartsVertically]);

  // ── Структура потерь: скважина − умягчённая; умягчённая − производственные нужды ──
  const { lossWashM3, lossOsmosisM3 } = useMemo(() => {
    const wash = parseFloat((kpi.sourceMonth - kpi.softenedWaterMonth).toFixed(2));
    const osm = parseFloat((kpi.softenedWaterMonth - kpi.productionMonth).toFixed(2));
    return { lossWashM3: wash, lossOsmosisM3: osm };
  }, [kpi.sourceMonth, kpi.softenedWaterMonth, kpi.productionMonth]);

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
      filterLoss: lossWashM3,
      osmosisLoss: lossOsmosisM3,
      softenedWaterMonth: kpi.softenedWaterMonth,
      activeAlerts: 0,
    });
    // Очищаем контекст при уходе с дашборда
    return () => setAIChatWaterContext(null);
  }, [kpi, selectedMonth, loading, lossWashM3, lossOsmosisM3]);

  useEffect(() => {
    if (
      distributionRole === 'production' &&
      !monthlyMeterRows.some(row => row.role === 'production' || row.role === 'source')
    ) {
      setDistributionRole('domestic');
    }
    if (distributionRole === 'domestic' && !monthlyMeterRows.some(row => row.role === 'domestic')) {
      setDistributionRole('production');
    }
  }, [distributionRole, monthlyMeterRows]);

  /**
   * Одна фиксированная палитра на все серии баланса и распределения: производство + хозбыт вместе,
   * чтобы на одном графике не было двух похожих полос и цвет не «плавал» от HSL.
   */
  const balanceMeterColorMap = useMemo(() => {
    const prodLabels = monthlyMeterRows.filter(r => r.role === 'production').map(r => r.label);
    const domLabels = monthlyMeterRows.filter(r => r.role === 'domestic').map(r => r.label);
    const keys = [
      ...new Set([
        ...prodLabels,
        ...domLabels,
        ...productionDeviceNames,
        ...domesticDeviceNames,
      ]),
    ];
    return buildMeterLabelColorMap(keys);
  }, [monthlyMeterRows, productionDeviceNames, domesticDeviceNames]);

  const balanceDockPanelData = useMemo(() => {
    if (balanceDockedTip == null) return null;
    if (!balanceDockPinned) return balanceDockedTip;
    const day = String(balanceDockedTip.label);
    const row = balanceChartDisplayData.find(r => String(r.date) === day);
    if (!row) return balanceDockedTip;
    return buildBalanceDockedTipFromRow(
      row,
      productionDeviceNames,
      domesticDeviceNames,
      balanceMeterColorMap,
      hiddenDevices.has('__source__'),
    );
  }, [
    balanceDockedTip,
    balanceDockPinned,
    balanceChartDisplayData,
    productionDeviceNames,
    domesticDeviceNames,
    balanceMeterColorMap,
    hiddenDevices,
  ]);

  const onBalanceChartClick = useCallback(
    (state: MouseHandlerDataParam) => {
      const idx = balanceChartRowIndexFromPointerState(state, balanceChartDisplayData);
      if (idx == null || idx < 0 || idx >= balanceChartDisplayData.length) return;
      const row = balanceChartDisplayData[idx];
      if (row == null) return;
      const clickDay = String(row.date);
      if (balanceDockPinned && balanceDockedTip != null && String(balanceDockedTip.label) === clickDay) {
        setBalanceDockPinned(false);
        balanceDockedRelayFpRef.current = null;
        setBalanceDockedTip(null);
        return;
      }
      const built = buildBalanceDockedTipFromRow(
        row,
        productionDeviceNames,
        domesticDeviceNames,
        balanceMeterColorMap,
        hiddenDevices.has('__source__'),
      );
      balanceDockedRelayFpRef.current = balanceDockedTipFingerprint(built.label, built.payload);
      setBalanceDockedTip(built);
      setBalanceDockPinned(true);
      balanceDockDismissedRef.current = false;
    },
    [
      balanceChartDisplayData,
      balanceDockPinned,
      balanceDockedTip,
      balanceMeterColorMap,
      domesticDeviceNames,
      hiddenDevices,
      productionDeviceNames,
    ],
  );

  const hasDistributionMeterData = useMemo(
    () =>
      monthlyMeterRows.some(row => row.role === 'source' || row.role === 'production') ||
      monthlyMeterRows.some(row => row.role === 'domestic'),
    [monthlyMeterRows],
  );

  const distributionRows = useMemo(() => {
    if (distributionRole === 'production') {
      const sourceRows = monthlyMeterRows
        .filter(row => row.role === 'source')
        .sort((a, b) => b.currentMonth - a.currentMonth)
        .map(row => ({ ...row, color: SOURCE_COLOR }));

      const productionRowsSorted = monthlyMeterRows
        .filter(row => row.role === 'production')
        .sort((a, b) => {
          const sa = a.distributionSection === 'hvo_inlet' ? 0 : 1;
          const sb = b.distributionSection === 'hvo_inlet' ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return b.currentMonth - a.currentMonth;
        });
      const productionRows = productionRowsSorted.map(row => ({
        ...row,
        color: balanceMeterColorMap.get(row.label) ?? '#64748b',
      }));

      return [...sourceRows, ...productionRows];
    }

    const domesticSorted = monthlyMeterRows
      .filter(row => row.role === 'domestic')
      .sort((a, b) => b.currentMonth - a.currentMonth);
    return domesticSorted.map(row => ({
      ...row,
      color: balanceMeterColorMap.get(row.label) ?? '#64748b',
    }));
  }, [distributionRole, monthlyMeterRows, balanceMeterColorMap]);

  const productionChartLines = useMemo(
    () =>
      productionDeviceNames.map((name) => {
        const c = balanceMeterColorMap.get(name) ?? '#64748b';
        const strokeW = isMobile ? 2.5 : 2;
        const adR = isMobile ? 6 : 5;
        return (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={c}
            strokeWidth={strokeW}
            dot={false}
            activeDot={{ r: adR, stroke: '#fff', strokeWidth: 2, fill: c }}
            connectNulls
          />
        );
      }),
    [productionDeviceNames, balanceMeterColorMap, isMobile],
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

      {/* ── KPI: на мобильных — одна карточка; на десктопе — сетка ─────── */}
      {isMobile ? (
        <div className="wd-kpi-mobile-card">
          <div className="wd-kpi-mobile-card__title">Расход воды за месяц</div>
          <div className="wd-kpi-mobile-card__rows">
            <div className="wd-kpi-mobile-row wd-kpi-mobile-row--blue">
              <span className="wd-kpi-mobile-row__icon" aria-hidden>🚰</span>
              <span className="wd-kpi-mobile-row__label">Скважина (вход)</span>
              <span className="wd-kpi-mobile-row__value">{kpi.sourceMonth.toLocaleString('ru-RU')} м³</span>
            </div>
            <div className="wd-kpi-mobile-row wd-kpi-mobile-row--teal">
              <span className="wd-kpi-mobile-row__icon" aria-hidden>🏭</span>
              <span className="wd-kpi-mobile-row__label">Производственные нужды</span>
              <span className="wd-kpi-mobile-row__value">{kpi.productionMonth.toLocaleString('ru-RU')} м³</span>
            </div>
            <div className="wd-kpi-mobile-row wd-kpi-mobile-row--green">
              <span className="wd-kpi-mobile-row__icon" aria-hidden>🏠</span>
              <span className="wd-kpi-mobile-row__label">Хоз-питьевое</span>
              <span className="wd-kpi-mobile-row__value">{kpi.domesticMonth.toLocaleString('ru-RU')} м³</span>
            </div>
            <div
              className={
                kpi.lossesPct > 15
                  ? 'wd-kpi-mobile-row wd-kpi-mobile-row--red'
                  : kpi.lossesPct > 8
                    ? 'wd-kpi-mobile-row wd-kpi-mobile-row--orange'
                    : 'wd-kpi-mobile-row wd-kpi-mobile-row--muted'
              }
            >
              <span className="wd-kpi-mobile-row__icon" aria-hidden>💨</span>
              <span className="wd-kpi-mobile-row__label">Потери воды</span>
              <span className="wd-kpi-mobile-row__value">
                {kpi.lossesMonth.toLocaleString('ru-RU')} м³
                <span className="wd-kpi-mobile-row__pct"> ({kpi.lossesPct}%)</span>
              </span>
            </div>
          </div>
          <div className="wd-kpi-mobile-card__subsection">
            <div className="wd-kpi-mobile-card__subsection-title">Структура потерь</div>
            <div className="wd-kpi-mobile-split">
              <span>Промывка</span>
              <strong>{lossWashM3.toLocaleString('ru-RU')} м³</strong>
              <span className="wd-kpi-mobile-split__pct">
                ({kpi.lossesMonth > 0 ? ((lossWashM3 / kpi.lossesMonth) * 100).toFixed(0) : 0}%)
              </span>
            </div>
            <div className="wd-kpi-mobile-split">
              <span>Осмос</span>
              <strong>{lossOsmosisM3.toLocaleString('ru-RU')} м³</strong>
              <span className="wd-kpi-mobile-split__pct">
                ({kpi.lossesMonth > 0 ? ((lossOsmosisM3 / kpi.lossesMonth) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>
        </div>
      ) : (
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
              <div className="wd-kpi__label">Производственные нужды, месяц</div>
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
            <div className="wd-kpi__text-block">
              <div className="wd-kpi__label">Структура потерь</div>
              <div className="wd-kpi__split-row">
                <span>Промывка:</span>
                <strong>{lossWashM3.toLocaleString('ru-RU')} м³</strong>
                <span className="wd-kpi__pct">({kpi.lossesMonth > 0 ? ((lossWashM3 / kpi.lossesMonth) * 100).toFixed(0) : 0}%)</span>
              </div>
              <div className="wd-kpi__split-row">
                <span>Осмос:</span>
                <strong>{lossOsmosisM3.toLocaleString('ru-RU')} м³</strong>
                <span className="wd-kpi__pct">({kpi.lossesMonth > 0 ? ((lossOsmosisM3 / kpi.lossesMonth) * 100).toFixed(0) : 0}%)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="wd-view-tabs" role="tablist" aria-label="Экран дашборда">
        <button
          type="button"
          role="tab"
          aria-selected={dashboardView === 'charts'}
          className={`wd-view-tab${dashboardView === 'charts' ? ' wd-view-tab--active' : ''}`}
          onClick={() => setDashboardView('charts')}
        >
          Графики и баланс
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashboardView === 'distribution'}
          className={`wd-view-tab${dashboardView === 'distribution' ? ' wd-view-tab--active' : ''}`}
          onClick={() => setDashboardView('distribution')}
        >
          Распределение по учётам
        </button>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      {dashboardView === 'charts' && (
      <div className="wd-charts-row">

        {/* Balance Chart */}
        <div className="wd-card wd-card--consumption">
          <div className="wd-card__header wd-card__header--balance">
            <h3 className="wd-balance-card__title">
              <span className="wd-balance-card__title-text">💧 Водный баланс</span>
              <span className="wd-balance-card__title-period">
                {' — '}
                {new Date(selectedMonth.year, selectedMonth.month)
                  .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
                  .replace(/^./, c => c.toUpperCase())}
              </span>
            </h3>
            <div className="wd-card__header-row wd-card__header-row--balance">
              <select
                className="wd-period-select wd-period-select--balance"
                aria-label="Месяц для графика водного баланса"
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
          </div>
          {balanceNarrowPhoneLayout && balanceData.length > 0 && (
            <div className="wd-balance-mobile-range" role="group" aria-label="Масштаб графика по дням">
              <span className="wd-balance-mobile-range__label">На графике:</span>
              {(
                [
                  { id: '7' as const, label: '7 дн.' },
                  { id: '14' as const, label: '14 дн.' },
                  { id: 'month' as const, label: 'Месяц' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={
                    balanceMobileRange === id
                      ? 'wd-balance-mobile-range__btn wd-balance-mobile-range__btn--active'
                      : 'wd-balance-mobile-range__btn'
                  }
                  onClick={() => setBalanceMobileRange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {balanceData.length > 0 ? (
            <div className="wd-balance-wrap">
              <div className="wd-balance-chart-col" onPointerLeave={onBalanceChartColPointerLeave}>
              {balanceNarrowPhoneLayout && balanceMobileRange === 'month' && (
                <p className="wd-balance-scroll-hint">Проведите пальцем влево-вправо, чтобы увидеть все дни</p>
              )}
              <div
                className={
                  balanceNarrowPhoneLayout && balanceMobileRange === 'month'
                    ? 'wd-balance-chart wd-balance-chart-scroll'
                    : 'wd-balance-chart'
                }
              >
                <div
                  className={
                    balanceNarrowPhoneLayout && balanceMobileRange === 'month'
                      ? 'wd-balance-chart-scroll__inner'
                      : undefined
                  }
                  style={
                    balanceNarrowPhoneLayout && balanceMobileRange === 'month'
                      ? {
                          width: balanceChartPixelWidth,
                          minWidth: balanceChartPixelWidth,
                          height: balanceChartInnerHeight,
                        }
                      : { width: '100%', height: balanceChartInnerHeight }
                  }
                  onPointerDown={() => {
                    balanceDockDismissedRef.current = false;
                  }}
                  role="presentation"
                >
                  <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={balanceChartDisplayData}
                    margin={balanceChartMargin}
                    onClick={onBalanceChartClick}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                      dataKey="date"
                      tick={balanceXAxisTick}
                      interval={balanceXAxisInterval}
                      tickMargin={balanceNarrowPhoneLayout ? 6 : 4}
                      minTickGap={balanceNarrowPhoneLayout ? 4 : 0}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit=" м³" width={58} />
                    <Tooltip
                      trigger={balanceNarrowPhoneLayout ? 'click' : 'hover'}
                      cursor={false}
                      wrapperStyle={{ display: 'none' }}
                      content={(tipProps) => (
                        <BalanceTooltipToDockedRelay
                          active={tipProps.active}
                          label={tipProps.label}
                          payload={tipProps.payload as ReadonlyArray<ProductionTooltipPayloadEntry> | undefined}
                          onRelay={onBalanceDockRelay}
                          dockDismissedRef={balanceDockDismissedRef}
                          pinned={balanceDockPinned}
                        />
                      )}
                    />
                    {/* Производственные счётчики */}
                    {productionDeviceNames.map((name) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="balance"
                        fill={balanceMeterColorMap.get(name) ?? '#64748b'}
                        maxBarSize={balanceBarMaxSize}
                      />
                    ))}
                    {/* Хоз-питьевые счётчики */}
                    {domesticDeviceNames.map((name) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="balance"
                        fill={balanceMeterColorMap.get(name) ?? '#64748b'}
                        maxBarSize={balanceBarMaxSize}
                      />
                    ))}
                    {/* Потери — красная зона */}
                    <Bar
                      dataKey="losses"
                      stackId="balance"
                      fill={LOSSES_COLOR}
                      fillOpacity={0.7}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={balanceBarMaxSize}
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
              </div>
              {balanceDockPanelData != null && balanceDockPanelData.payload.length > 0 ? (
                <BalanceDockedDayPanel
                  label={balanceDockPanelData.label}
                  payload={balanceDockPanelData.payload}
                  selectedMonth={selectedMonth}
                  onClose={() => {
                    balanceDockDismissedRef.current = true;
                    balanceDockedRelayFpRef.current = null;
                    setBalanceDockPinned(false);
                    setBalanceDockedTip(null);
                  }}
                />
              ) : null}
              </div>
              <div className="wd-device-filter">
                {/* Скважина — переключаемая */}
                <button
                  className={`wd-device-filter__item${hiddenDevices.has('__source__') ? ' wd-device-filter__item--hidden' : ''}`}
                  onClick={() => toggleDevice('__source__')}
                  title={hiddenDevices.has('__source__') ? 'Показать' : 'Скрыть'}
                >
                  <span className="wd-device-filter__dot wd-device-filter__dot--line" style={{ background: SOURCE_COLOR }} />
                  <span className="wd-device-filter__name" style={{ color: SOURCE_COLOR }}>Скважина</span>
                </button>
                {/* Потери — переключаемая */}
                <button
                  className={`wd-device-filter__item${hiddenDevices.has('__losses__') ? ' wd-device-filter__item--hidden' : ''}`}
                  onClick={() => toggleDevice('__losses__')}
                  title={hiddenDevices.has('__losses__') ? 'Показать' : 'Скрыть'}
                >
                  <span className="wd-device-filter__dot" style={{ background: LOSSES_COLOR }} />
                  <span className="wd-device-filter__name" style={{ color: LOSSES_COLOR }}>Потери</span>
                </button>
                {/* Счётчики — объекты */}
                {[
                  ...productionDeviceNames.map((name) => ({ name, color: balanceMeterColorMap.get(name) ?? '#64748b' })),
                  ...domesticDeviceNames.map((name) => ({ name, color: balanceMeterColorMap.get(name) ?? '#64748b' })),
                ].map(({ name, color }) => (
                  <button
                    key={name}
                    className={`wd-device-filter__item${hiddenDevices.has(name) ? ' wd-device-filter__item--hidden' : ''}`}
                    onClick={() => toggleDevice(name)}
                    title={hiddenDevices.has(name) ? 'Показать' : 'Скрыть'}
                  >
                    <span className="wd-device-filter__dot" style={{ background: color }} />
                    <span className="wd-device-filter__name" style={{ color }}>{name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="wd-no-data">Нет данных по показаниям счётчиков за период</div>
          )}
        </div>

        {/* Почасовой расход производства (выбранный день) */}
        <div className="wd-card wd-card--prod-trend">
          <div className="wd-card__header wd-card__header--prod">
            <h3>🏭 Производство</h3>
            <div className="wd-prod-day-select">
              <select
                className="wd-prod-day-select__control"
                value={selectedProductionDay}
                onChange={(e) => {
                  const day = e.target.value;
                  setSelectedProductionDay(day);
                  const prodDevs = productionDevicesForBalanceChart(prodDevicesRef.current);
                  void loadProductionDayReadings(day, prodDevs);
                }}
              >
                {productionDayOptions.map((opt) => {
                  const hist = productionHistoryByDay[opt.ymd];
                  const suffix = hist ? ` — ${Number(hist.total_m3).toFixed(0)} м³` : '';
                  return (
                    <option key={opt.ymd} value={opt.ymd}>
                      {opt.label}{suffix}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {todayLoading ? (
            <div className="wd-no-data">Загрузка...</div>
          ) : todayTimeData.length > 0 ? (
            <>
              <p className="wd-prod-chart-hint">
                Накопление за сутки, м³ (↑). Для сегодня на графике только часы до текущего; за прошедшие дни —
                весь день (0–23 ч). Видна часть шкалы на ширину карточки — прокручивайте график вбок.
              </p>
              <div ref={prodChartScrollViewportRef} className="wd-prod-chart-scroll">
                <div
                  className="wd-prod-chart-scroll__inner"
                  style={{
                    width: productionChartScrollWidth,
                    minWidth: productionChartScrollWidth,
                    height: productionChartInnerHeight,
                  }}
                  onPointerDown={() => {
                    flushSync(() => setProductionTooltipDismissed(false));
                  }}
                  onMouseEnter={() => setProductionTooltipDismissed(false)}
                  role="presentation"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={todayTimeData}
                      margin={productionChartMargin}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="time"
                        interval={0}
                        tickMargin={8}
                        minTickGap={4}
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        tickFormatter={(t) => {
                          const h = parseInt(String(t).split(':')[0] ?? '', 10);
                          return Number.isFinite(h) ? `${h}ч` : String(t);
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        unit=" м³"
                        width={isMobile ? 50 : 56}
                        tickCount={isMobile ? 5 : 6}
                      />
                      <Tooltip
                        trigger={isMobile ? 'click' : 'hover'}
                        active={productionTooltipDismissed ? false : undefined}
                        allowEscapeViewBox={{ x: true, y: true }}
                        portal={productionChartTooltipPortalHost}
                        wrapperStyle={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          left: 'auto',
                          bottom: 'auto',
                          transform: 'none',
                          margin: 0,
                          padding: 0,
                          pointerEvents: 'none',
                          zIndex: 30,
                          maxWidth: 'calc(100% - 8px)',
                          boxSizing: 'border-box',
                        }}
                        content={(tipProps) => (
                          <ProductionChartTooltip
                            active={tipProps.active}
                            label={tipProps.label}
                            payload={tipProps.payload as ReadonlyArray<ProductionTooltipPayloadEntry>}
                            onClose={() => setProductionTooltipDismissed(true)}
                          />
                        )}
                      />
                      {productionChartLines}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="wd-prod-legend" aria-label="Легенда графика">
                {productionDeviceNames.map((name) => {
                  const c = balanceMeterColorMap.get(name) ?? '#64748b';
                  return (
                    <div key={name} className="wd-prod-legend__item">
                      <span className="wd-prod-legend__dot" style={{ background: c }} />
                      <span className="wd-prod-legend__name" title={name}>{name}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="wd-no-data">Нет показаний за сегодня</div>
          )}
          <div className="wd-month-total-foot">
            Производственные нужды за сутки (ЛУ+АЛПО+сортировка):{' '}
            <strong>{productionTodayTotalM3.toLocaleString('ru-RU')} м³</strong>
          </div>
          {productionDeviceNames.length > 0 && (
            <div className="wd-work-hours-foot">
              Часы работы и накопление м³ по учётам (по данным графика):{' '}
              <strong className="wd-work-hours-foot__list">
                {productionDeviceNames.map((name, idx) => {
                  const h = productionTodayWorkHoursByName[name] ?? 0;
                  const m3 = productionTodayM3ByName[name] ?? 0;
                  return (
                    <span key={name} className="wd-work-hours-foot__item">
                      {idx > 0 ? '; ' : null}
                      <span className="wd-work-hours-foot__meter">{name}:</span>{' '}
                      <span className="wd-work-hours-foot__hours">{h} ч</span>
                      <span className="wd-work-hours-foot__sep">, </span>
                      <span className="wd-work-hours-foot__cum">
                        {m3.toLocaleString('ru-RU')} м³
                      </span>
                    </span>
                  );
                })}
              </strong>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Monthly distribution ────────────────────────────────────────── */}
      {dashboardView === 'distribution' && !hasDistributionMeterData && (
        <div className="wd-card">
          <div className="wd-no-data">
            Нет данных для распределения. Укажите роли счётчиков на вкладке «Счётчики воды».
          </div>
        </div>
      )}
      {dashboardView === 'distribution' && hasDistributionMeterData && (
        <div className="wd-card wd-card--domestic-dist">
          <div className="wd-card__header">
            <h3>📊 Распределение по учётам</h3>
            <span className="wd-card__hint">м³ за месяц и среднее за сутки</span>
          </div>
          <div className="wd-distribution-tabs" role="tablist" aria-label="Группа учётов">
            <button
              type="button"
              className={`wd-distribution-tab${distributionRole === 'production' ? ' wd-distribution-tab--active' : ''}`}
              onClick={() => setDistributionRole('production')}
            >
              Производственные ({workDayStats.production})
            </button>
            <button
              type="button"
              className={`wd-distribution-tab${distributionRole === 'domestic' ? ' wd-distribution-tab--active' : ''}`}
              onClick={() => setDistributionRole('domestic')}
            >
              Хоз-питьевой ({workDayStats.domestic})
            </button>
          </div>
          {distributionRows.length > 0 ? (
            <div className="wd-domestic-dist">
              {distributionRows.map((item, index) => {
                const pct = item.shareOfRole;
                const averageLabel = `ср./сутки ${item.averagePerDay.toLocaleString('ru-RU')} м³`;
                const prev = index > 0 ? distributionRows[index - 1] : null;
                const showHvoTitle =
                  distributionRole === 'production' &&
                  item.role === 'production' &&
                  item.distributionSection === 'hvo_inlet' &&
                  (!prev || prev.role !== 'production' || prev.distributionSection !== 'hvo_inlet');
                const showInternalTitle =
                  distributionRole === 'production' &&
                  item.role === 'production' &&
                  item.distributionSection === 'internal' &&
                  (!prev || prev.distributionSection !== 'internal');

                return (
                  <React.Fragment key={item.key}>
                    {showHvoTitle ? (
                      <div className="wd-distribution-section-title">Вход ХВО (суммарный учёт)</div>
                    ) : null}
                    {showInternalTitle ? (
                      <div className="wd-distribution-section-title">Внутри производства</div>
                    ) : null}
                  <div className="wd-domestic-dist__item">
                    <div className="wd-domestic-dist__name-wrap">
                      <span className="wd-domestic-dist__name" style={{ color: item.color }}>{item.label}</span>
                      {item.isCombined && (
                        <span className="wd-domestic-dist__badge">{item.deviceCount} счётчика</span>
                      )}
                    </div>
                    <div className="wd-domestic-dist__track">
                      <div
                        className="wd-domestic-dist__bar"
                        style={{ width: `${pct}%`, background: item.color }}
                      />
                    </div>
                    <span className="wd-domestic-dist__val">{item.currentMonth.toLocaleString('ru-RU')} м³</span>
                    <div className="wd-domestic-dist__meta">
                      <span className="wd-domestic-dist__pct">{pct.toFixed(1)}%</span>
                      <span className="wd-domestic-dist__avg">{averageLabel}</span>
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="wd-no-data">Нет данных по выбранной группе учётов</div>
          )}
          {distributionRole === 'production' && (
            <div className="wd-month-total-foot">
              Производственные нужды за месяц (как в KPI):{' '}
              <strong>{kpi.productionMonth.toLocaleString('ru-RU')} м³</strong>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default WaterDashboard;
