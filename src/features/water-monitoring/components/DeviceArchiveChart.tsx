import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import './DeviceArchiveChart.css';

export interface ChartDataPoint {
  date: string;
  reading: number;  // накопленное показание счётчика
  volume: number;   // потребление за период
  /** true — есть реальная точка данных в этом периоде */
  hasData?: boolean;
}

interface Props {
  data: ChartDataPoint[];
  groupBy: 'hour' | 'day' | 'week' | 'month' | 'year';
}

const PERIOD_LABEL: Record<string, string> = {
  hour: 'час',
  day: 'сутки',
  week: 'неделю',
  month: 'месяц',
  year: 'год',
};

// Tooltip с понятным форматом
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="archive-chart-tooltip">
      <p className="archive-chart-tooltip__label">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color, margin: '3px 0' }}>
          {entry.name}:{' '}
          <strong>
            {entry.value != null ? `${Number(entry.value).toFixed(3)} м³` : '—'}
          </strong>
        </p>
      ))}
    </div>
  );
};

const DeviceArchiveChart: React.FC<Props> = ({ data, groupBy }) => {
  // Заменяем reading=0 на null чтобы линия не падала в 0 при пропусках
  const processedData = useMemo(
    () => data.map(d => ({ ...d, readingLine: d.reading > 0 ? d.reading : null })),
    [data],
  );

  // Сводная статистика
  const stats = useMemo(() => {
    if (!data.length) return null;
    const withReading = data.filter(d => d.hasData);
    const totalConsumption = data.reduce((s, d) => s + (d.volume || 0), 0);
    const maxVolume = Math.max(...data.map(d => d.volume || 0));
    const avgVolume = withReading.length > 0 ? totalConsumption / withReading.length : 0;
    const missingCount = data.length - withReading.length;
    const completeness = Math.round((withReading.length / data.length) * 100);
    return { totalConsumption, maxVolume, avgVolume, missingCount, completeness };
  }, [data]);

  // Начальный диапазон Brush: для почасовых данных — последние 48 периодов
  const brushStartIndex = useMemo(() => {
    if (groupBy === 'hour' && data.length > 48) return data.length - 48;
    return 0;
  }, [data.length, groupBy]);

  // Шаг меток X чтобы не было каши
  const xAxisInterval = useMemo(() => {
    if (data.length > 200) return Math.floor(data.length / 20);
    if (data.length > 50) return Math.floor(data.length / 15);
    if (data.length > 20) return Math.floor(data.length / 10);
    return 0;
  }, [data.length]);

  const periodLabel = PERIOD_LABEL[groupBy] ?? groupBy;

  if (!data.length) {
    return (
      <div className="archive-chart-empty">Нет данных для отображения графика</div>
    );
  }

  return (
    <div className="device-archive-chart">
      {/* Сводные карточки */}
      {stats && (
        <div className="archive-stats-grid">
          <div className="archive-stat-card">
            <div className="archive-stat-label">Всего за период</div>
            <div className="archive-stat-value">{stats.totalConsumption.toFixed(2)} м³</div>
          </div>
          <div className="archive-stat-card">
            <div className="archive-stat-label">Среднее за {periodLabel}</div>
            <div className="archive-stat-value">{stats.avgVolume.toFixed(3)} м³</div>
          </div>
          <div className="archive-stat-card">
            <div className="archive-stat-label">Максимум за {periodLabel}</div>
            <div className="archive-stat-value archive-stat-value--accent">
              {stats.maxVolume.toFixed(3)} м³
            </div>
          </div>
          <div className={`archive-stat-card ${stats.completeness < 80 ? 'archive-stat-card--warn' : ''}`}>
            <div className="archive-stat-label">Полнота данных</div>
            <div className={`archive-stat-value ${stats.completeness < 80 ? 'archive-stat-value--warn' : 'archive-stat-value--ok'}`}>
              {stats.completeness}%
              {stats.missingCount > 0 && (
                <span className="archive-stat-missing">{stats.missingCount} пропусков</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Комбинированный график: столбцы (потребление) + линия (показание) */}
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={processedData} margin={{ top: 10, right: 70, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
          <XAxis
            dataKey="date"
            angle={-40}
            textAnchor="end"
            height={70}
            interval={xAxisInterval}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          {/* Левая ось — потребление (столбцы) */}
          <YAxis
            yAxisId="volume"
            orientation="left"
            tick={{ fontSize: 11, fill: '#3b82f6' }}
            label={{ value: 'Потребление (м³)', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 11, dx: -10 }}
          />
          {/* Правая ось — накопленное показание (линия) */}
          <YAxis
            yAxisId="reading"
            orientation="right"
            tick={{ fontSize: 11, fill: '#f97316' }}
            label={{ value: 'Показание (м³)', angle: 90, position: 'insideRight', fill: '#f97316', fontSize: 11, dx: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: 8, fontSize: 13 }} />
          <Bar
            yAxisId="volume"
            dataKey="volume"
            name="Потребление"
            fill="#3b82f6"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="reading"
            type="monotone"
            dataKey="readingLine"
            name="Показание счётчика"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
          {/* Brush — встроенный зум вместо ручных слайдеров */}
          <Brush
            dataKey="date"
            height={26}
            stroke="#cbd5e1"
            fill="#f8fafc"
            travellerWidth={8}
            startIndex={brushStartIndex}
            endIndex={data.length - 1}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="archive-chart-hint">
        Используйте полосу внизу графика для выбора периода. Синие столбцы — потребление за {periodLabel},
        оранжевая линия — накопленное показание счётчика.
      </p>
    </div>
  );
};

export default DeviceArchiveChart;
