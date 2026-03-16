/**
 * Парсер счёт-фактур Брестводоканала (bvod.by).
 *
 * Формат PDF: таблица с колонками
 *   Наименование | Кол-во | Коэф-т | Объём | Тариф | Стоимость без НДС | НДС | Сумма с НДС
 *
 * Числа в PDF имеют пробелы: "226. 00", "1. 6023", "1 985. 72" — нужна очистка.
 */

export interface ParsedInvoice {
  period: string;                 // 'YYYY-MM', например '2026-01'
  account_number?: string;        // лицевой счёт: '107.00'
  volume_m3?: number;             // суммарный объём воды (Вода, Кол-во), м³
  tariff_per_m3?: number;         // тариф на воду, BYN/м³
  sewage_volume_m3?: number;      // суммарный объём канализации, м³
  sewage_tariff_per_m3?: number;  // тариф на канализацию, BYN/м³
  amount_byn?: number;            // итого к оплате с НДС, BYN
}

// Месяцы на русском → номер
const MONTH_MAP: Record<string, string> = {
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
  'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
  'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
  'январь': '01', 'февраль': '02', 'март': '03', 'апрель': '04',
  'май': '05', 'июнь': '06', 'июль': '07', 'август': '08',
  'сентябрь': '09', 'октябрь': '10', 'ноябрь': '11', 'декабрь': '12',
};

/**
 * Убирает пробелы внутри числа и приводит к float.
 * "1 985. 72" → 1985.72, "1. 6023" → 1.6023, "226. 00" → 226.0
 */
function parseNum(s: string): number {
  return parseFloat(s.replace(/\s+/g, ''));
}

/**
 * Извлекает период из имени файла.
 * "schet_107_00_yanvar_2026.pdf" → нет чёткого YYYY-MM паттерна, поэтому
 * основной источник — текст документа.
 * Резервно: ищем YYYY-MM в имени файла.
 */
function periodFromFileName(fileName: string): string | null {
  const m = fileName.match(/[_\-](\d{4})[_\-](\d{2})[_\-.\s]/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

/**
 * Основная функция парсинга.
 * Принимает сырой текст (из readInvoiceFile) и имя файла.
 */
export function parseInvoiceText(text: string, fileName: string): ParsedInvoice {
  // --- ПЕРИОД ---
  // Ищем "за Январь 2026 г." / "за Январь    2026  г."
  let period = '';
  const periodMatch = text.match(/за\s+([А-ЯЁа-яё]+)\s+(20\d{2})\s*г\./i);
  if (periodMatch) {
    const monthName = periodMatch[1].toLowerCase();
    const year = periodMatch[2];
    const monthNum = MONTH_MAP[monthName];
    if (monthNum) period = `${year}-${monthNum}`;
  }
  if (!period) {
    period = periodFromFileName(fileName) ?? 'unknown';
  }

  // --- ЛИЦЕВОЙ СЧЁТ ---
  // "По лиц.счету No    107. 00" или "договор ... No   107. 09"
  let account_number: string | undefined;
  const accountMatch = text.match(/лиц\.?счету?\s+No\s+([\d\s.]+)/i);
  if (accountMatch) {
    account_number = accountMatch[1].replace(/\s+/g, '').replace(/\.$/, '');
  }

  // --- ОБЪЁМ ВОДЫ И КАНАЛИЗАЦИИ (суммарный) ---
  // Строки вида: "Вода  , м.куб.  |   226. 00|   1. 12  |   253. 12|   1. 6023|"
  //              "Канализация  , м.куб.  |  226. 00|  1. 00  |  226. 00|  1. 8538|"
  // Колонки: [Кол-во, Коэф-т, Объём, Тариф, Стоимость_без_НДС, НДС, Сумма_с_НДС]
  let volume_m3 = 0;
  let tariff_per_m3: number | undefined;
  let sewage_volume_m3 = 0;
  let sewage_tariff_per_m3: number | undefined;

  const lines = text.split('\n');
  for (const line of lines) {
    const nums = [...line.matchAll(/([\d]+[\d\s]*\.[\s\d]+)/g)]
      .map(m => parseNum(m[1]))
      .filter(n => !isNaN(n) && n > 0);

    if (/[Вв]ода\s*,\s*м/.test(line)) {
      if (nums.length >= 1) volume_m3 += nums[0];
      if (nums.length >= 4 && tariff_per_m3 === undefined) tariff_per_m3 = nums[3];
    } else if (/[Кк]анализация\s*,\s*м/.test(line)) {
      if (nums.length >= 1) sewage_volume_m3 += nums[0];
      if (nums.length >= 4 && sewage_tariff_per_m3 === undefined) sewage_tariff_per_m3 = nums[3];
    }
  }

  // --- ИТОГО К ОПЛАТЕ ---
  // "Итого к оплате  |  1654. 78|  330. 94|  1985. 72|"
  // Берём последнее число в строке (сумма с НДС)
  let amount_byn: number | undefined;
  const totalMatch = text.match(/[Ии]того\s+к\s+оплате[^\n]*?([\d][\d\s]*\.[\s\d]+)\s*\|?\s*$/m);
  if (totalMatch) {
    amount_byn = parseNum(totalMatch[1]);
  }
  // Запасной вариант: ищем строку с "Итого к оплате" и берём все числа
  if (!amount_byn) {
    for (const line of lines) {
      if (/[Ии]того\s+к\s+оплате/.test(line)) {
        const nums = [...line.matchAll(/([\d]+[\d\s]*\.[\s\d]+)/g)]
          .map(m => parseNum(m[1]))
          .filter(n => !isNaN(n) && n > 0);
        if (nums.length > 0) {
          amount_byn = nums[nums.length - 1]; // последнее число = с НДС
        }
        break;
      }
    }
  }

  return {
    period,
    account_number,
    volume_m3: volume_m3 > 0 ? Math.round(volume_m3 * 1000) / 1000 : undefined,
    tariff_per_m3,
    sewage_volume_m3: sewage_volume_m3 > 0 ? Math.round(sewage_volume_m3 * 1000) / 1000 : undefined,
    sewage_tariff_per_m3,
    amount_byn,
  };
}
