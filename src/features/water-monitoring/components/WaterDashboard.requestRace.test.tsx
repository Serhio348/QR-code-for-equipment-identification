import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WaterDashboard from './WaterDashboard';

type Page = { data: unknown[] | null; error: { message: string } | null };
type Hold = { promise: Promise<Page>; resolve: (value: Page) => void };

const aggHolds = vi.hoisted(() => new Map<string, Hold>());

vi.mock('recharts', () => ({
  ComposedChart: () => null,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: () => null,
}));

vi.mock('@/shared/config/supabase', () => {
  const holds = aggHolds;

  function from(table: string) {
    const filters: Record<string, string> = {};
    const run = (): Promise<Page> => {
      if (table === 'beliot_daily_readings_agg') {
        const key = filters['reading_day<'] ?? '';
        let hold = holds.get(key);
        if (!hold) {
          let resolve!: (value: Page) => void;
          const promise = new Promise<Page>((res) => {
            resolve = res;
          });
          hold = { promise, resolve };
          holds.set(key, hold);
        }
        return hold.promise;
      }
      if (table === 'beliot_devices') {
        return Promise.resolve({
          data: [{ device_id: 'src-1', bootstrap_group_name: 'Скважина' }],
          error: null,
        });
      }
      if (table === 'beliot_device_overrides') {
        return Promise.resolve({
          data: [{
            device_id: 'src-1',
            name: 'Скважина',
            object_name: 'Скважина',
            address: null,
            device_role: 'source',
            device_group: null,
          }],
          error: null,
        });
      }
      if (table === 'beliot_device_readings') {
        return Promise.resolve({
          data: [{ device_id: 'src-1', reading_value: 0 }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    };

    const builder: Record<string, unknown> = {};
    const chain = (): Record<string, unknown> => builder;
    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.gte = chain;
    builder.lte = chain;
    builder.lt = (column: string, value: string) => {
      filters[`${column}<`] = value;
      return builder;
    };
    builder.range = () => run();
    builder.maybeSingle = () => run();
    builder.upsert = () => Promise.resolve({ error: null });
    builder.then = (
      resolve: (value: Page) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => run().then(resolve, reject);
    return builder;
  }

  return { supabase: { from } };
});

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function shiftMonth(offset: number): { year: number; month: number } {
  const date = new Date();
  date.setMonth(date.getMonth() - offset);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthEnd(year: number, month: number): string {
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 1 : month + 2;
  return `${nextYear}-${pad(nextMonth)}-01`;
}

function releaseMonth(offset: number, volume: number | { error: string }): void {
  const { year, month } = shiftMonth(offset);
  const hold = aggHolds.get(monthEnd(year, month));
  if (!hold) {
    throw new Error(`Нет запроса баланса для смещения ${offset}`);
  }
  if (typeof volume === 'object') {
    hold.resolve({ data: null, error: { message: volume.error } });
    return;
  }
  const day = `${year}-${pad(month + 1)}-02`;
  hold.resolve({
    data: [{
      device_id: 'src-1',
      reading_day: day,
      min_value: 0,
      max_value: volume,
    }],
    error: null,
  });
}

async function waitForMonthQuery(offset: number): Promise<void> {
  const { year, month } = shiftMonth(offset);
  const key = monthEnd(year, month);
  await waitFor(() => {
    expect(aggHolds.has(key)).toBe(true);
  });
}

function sourceCard(): HTMLElement {
  const label = screen.getByText('Скважина (вход), месяц');
  const card = label.closest('.wd-kpi');
  if (!card) throw new Error('Карточка скважины не найдена');
  return card as HTMLElement;
}

describe('WaterDashboard month request race', () => {
  beforeEach(() => {
    aggHolds.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  });

  it('keeps the later month when the earlier month response arrives last', async () => {
    const user = userEvent.setup();
    render(<WaterDashboard />);

    await waitForMonthQuery(0);
    releaseMonth(0, 11);
    await waitFor(() => {
      expect(sourceCard()).toHaveTextContent('11 м³');
    });

    const previous = shiftMonth(1);
    const older = shiftMonth(2);
    await user.selectOptions(
      screen.getByLabelText('Месяц для графика водного баланса'),
      `${previous.year}-${previous.month}`,
    );
    await waitForMonthQuery(1);
    await user.selectOptions(
      screen.getByLabelText('Месяц для графика водного баланса'),
      `${older.year}-${older.month}`,
    );
    await waitForMonthQuery(2);

    releaseMonth(2, 73);
    await waitFor(() => {
      expect(sourceCard()).toHaveTextContent('73 м³');
    });

    releaseMonth(1, 41);

    expect(sourceCard()).toHaveTextContent('73 м³');
    expect(sourceCard()).not.toHaveTextContent('41 м³');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not replace the current month with an error from the previous request', async () => {
    const user = userEvent.setup();
    render(<WaterDashboard />);

    await waitForMonthQuery(0);
    releaseMonth(0, 11);
    await waitFor(() => {
      expect(sourceCard()).toHaveTextContent('11 м³');
    });

    const previous = shiftMonth(1);
    const older = shiftMonth(2);
    await user.selectOptions(
      screen.getByLabelText('Месяц для графика водного баланса'),
      `${previous.year}-${previous.month}`,
    );
    await waitForMonthQuery(1);
    await user.selectOptions(
      screen.getByLabelText('Месяц для графика водного баланса'),
      `${older.year}-${older.month}`,
    );
    await waitForMonthQuery(2);

    releaseMonth(2, 73);
    await waitFor(() => {
      expect(sourceCard()).toHaveTextContent('73 м³');
    });

    releaseMonth(1, { error: 'август опоздал' });

    expect(sourceCard()).toHaveTextContent('73 м³');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/август опоздал/)).not.toBeInTheDocument();
  });
});
