/**
 * Парсер счёт-фактур Брестводоканала (bvod.by).
 *
 * Формат PDF: таблица с колонками
 *   Наименование | Кол-во | Коэф-т | Объём | Тариф | Стоимость без НДС | НДС | Сумма с НДС
 *
 * Числа в PDF имеют пробелы: "226. 00", "1. 6023", "1 985. 72" — нужна очистка.
 *
 * Счёт состоит из нескольких секций (точек подключения):
 *   10700010-   Ввод с ул.Мицкевича   | Адрес- Советская 1
 *   10700030-   Артскважина            | Адрес- Советская 1
 *   и т.д.
 */

export interface InvoiceSection {
  id: string;           // '10700010'
  name: string;         // 'Ввод с ул.Мицкевича'
  address: string;      // 'Советская 1'
  volume_m3?: number;   // объём воды, м³
  sewage_m3?: number;   // объём канализации, м³
  amount_byn?: number;  // сумма с НДС по секции, BYN
}

export interface ParsedInvoice {
  period: string;                 // 'YYYY-MM', например '2026-01'
  account_number?: string;        // лицевой счёт: '107.00'
  volume_m3?: number;             // суммарный объём воды, м³
  tariff_per_m3?: number;         // тариф на воду, BYN/м³
  sewage_volume_m3?: number;      // суммарный объём канализации, м³
  sewage_tariff_per_m3?: number;  // тариф на канализацию, BYN/м³
  amount_byn?: number;            // итого к оплате с НДС, BYN
  sections?: InvoiceSection[];    // детализация по точкам подключения
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
 * Извлекает все числа из строки.
 */
function extractNums(line: string): number[] {
  return [...line.matchAll(/([\d]+[\d\s]*\.[\s\d]+)/g)]
    .map(m => parseNum(m[1]))
    .filter(n => !isNaN(n) && n > 0);
}

/**
 * Извлекает период из имени файла (резервный вариант).
 */
function periodFromFileName(fileName: string): string | null {
  const m = fileName.match(/[_\-](\d{4})[_\-](\d{2})[_\-.\s]/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

/**
 * Парсит одну секцию счёта (текст между двумя заголовками секций).
 * Возвращает объём воды, канализации и сумму по секции.
 */
function parseSection(sectionText: string, id: string, name: string, address: string): InvoiceSection {
  let volume_m3 = 0;
  let sewage_m3 = 0;
  let amount_byn = 0;

  for (const line of sectionText.split('\n')) {
    const nums = extractNums(line);
    if (/[Вв]ода\s*,\s*м/.test(line) && nums.length >= 1) {
      volume_m3 += nums[0];
      // Сумма с НДС — последнее число в строке
      if (nums.length >= 7) amount_byn += nums[6];
    } else if (/[Кк]анализация\s*,\s*м/.test(line) && nums.length >= 1) {
      sewage_m3 += nums[0];
      if (nums.length >= 7) amount_byn += nums[6];
    }
  }

  return {
    id,
    name: name.trim(),
    address: address.trim(),
    volume_m3: volume_m3 > 0 ? Math.round(volume_m3 * 1000) / 1000 : undefined,
    sewage_m3: sewage_m3 > 0 ? Math.round(sewage_m3 * 1000) / 1000 : undefined,
    amount_byn: amount_byn > 0 ? Math.round(amount_byn * 100) / 100 : undefined,
  };
}

/**
 * Основная функция парсинга.
 * Принимает сырой текст (из readInvoiceFile) и имя файла.
 */
export function parseInvoiceText(text: string, fileName: string): ParsedInvoice {
  // --- ПЕРИОД ---
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
  let account_number: string | undefined;
  const accountMatch = text.match(/лиц\.?счету?\s+No\s+([\d\s.]+)/i);
  if (accountMatch) {
    account_number = accountMatch[1].replace(/\s+/g, '').replace(/\.$/, '');
  }

  // --- СЕКЦИИ (детализация по точкам подключения) ---
  // Заголовок секции: "10700010-   Ввод с ул.Мицкевича   | Адрес-   Советская  1"
  const sectionHeaderRe = /(\d{5,10})-\s+(.+?)\s*\|\s*Адрес-\s*(.+)/g;
  const sections: InvoiceSection[] = [];

  // Находим все заголовки секций и их позиции в тексте
  const headers: Array<{ index: number; id: string; name: string; address: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = sectionHeaderRe.exec(text)) !== null) {
    headers.push({
      index: match.index,
      id: match[1],
      name: match[2].trim(),
      address: match[3].trim(),
    });
  }

  // Для каждой секции берём текст до следующей секции (или до конца)
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const sectionText = text.slice(start, end);
    sections.push(parseSection(sectionText, headers[i].id, headers[i].name, headers[i].address));
  }

  // --- СУММАРНЫЕ ОБЪЁМЫ (из всех строк "Вода" и "Канализация") ---
  let volume_m3 = 0;
  let tariff_per_m3: number | undefined;
  let sewage_volume_m3 = 0;
  let sewage_tariff_per_m3: number | undefined;

  for (const line of text.split('\n')) {
    const nums = extractNums(line);
    if (/[Вв]ода\s*,\s*м/.test(line)) {
      if (nums.length >= 1) volume_m3 += nums[0];
      if (nums.length >= 4 && tariff_per_m3 === undefined) tariff_per_m3 = nums[3];
    } else if (/[Кк]анализация\s*,\s*м/.test(line)) {
      if (nums.length >= 1) sewage_volume_m3 += nums[0];
      if (nums.length >= 4 && sewage_tariff_per_m3 === undefined) sewage_tariff_per_m3 = nums[3];
    }
  }

  // --- ИТОГО К ОПЛАТЕ ---
  let amount_byn: number | undefined;
  for (const line of text.split('\n')) {
    if (/[Ии]того\s+к\s+оплате/.test(line)) {
      const nums = extractNums(line);
      if (nums.length > 0) amount_byn = nums[nums.length - 1];
      break;
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
    sections: sections.length > 0 ? sections : undefined,
  };
}