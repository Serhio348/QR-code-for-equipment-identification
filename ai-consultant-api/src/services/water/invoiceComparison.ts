/**
 * invoiceComparison.ts
 *
 * Сравнение объёма и ключи тарифа в пределах одного лицевого счёта.
 * Нулевой предыдущий объём не считается процентом.
 */

export interface VolumeRow {
    period: string;
    account_number: string | null;
    volume_m3: number | null;
}

export type ConsumptionComparison =
    | { status: 'no_baseline' }
    | { status: 'zero_baseline'; currentPeriod: string; previousPeriod: string; currentVolume: number }
    | {
        status: 'compared';
        percent: number;
        currentPeriod: string;
        previousPeriod: string;
        currentVolume: number;
        previousVolume: number;
    };

export function compareAccountConsumption(
    rows: readonly VolumeRow[],
    accountNumber: string,
    currentPeriod: string,
): ConsumptionComparison {
    const own = rows
        .filter(row => row.account_number === accountNumber && row.volume_m3 != null && row.period <= currentPeriod)
        .sort((left, right) => right.period.localeCompare(left.period));
    const current = own.find(row => row.period === currentPeriod);
    const previous = own.find(row => row.period < currentPeriod);
    if (!current || current.volume_m3 == null || !previous || previous.volume_m3 == null) {
        return { status: 'no_baseline' };
    }
    if (previous.volume_m3 === 0) {
        return {
            status: 'zero_baseline',
            currentPeriod: current.period,
            previousPeriod: previous.period,
            currentVolume: current.volume_m3,
        };
    }
    const percent = Math.round(((current.volume_m3 - previous.volume_m3) / previous.volume_m3) * 100);
    return {
        status: 'compared',
        percent,
        currentPeriod: current.period,
        previousPeriod: previous.period,
        currentVolume: current.volume_m3,
        previousVolume: previous.volume_m3,
    };
}

/** Рост больше 20%. Нулевая база и чужой счёт уведомление не создают. */
export function consumptionGrowthAlert(comparison: ConsumptionComparison): Extract<ConsumptionComparison, { status: 'compared' }> | null {
    if (comparison.status !== 'compared' || comparison.percent <= 20) return null;
    return comparison;
}

export function tariffMemoryKey(kind: 'water' | 'sewage', accountNumber: string): string {
    return kind === 'water' ? `tariff_water:${accountNumber}` : `tariff_sewage:${accountNumber}`;
}
