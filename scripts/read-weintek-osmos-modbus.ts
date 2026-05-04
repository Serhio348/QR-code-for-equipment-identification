/**
 * read-weintek-osmos-modbus.ts
 *
 * Чтение параметров обратного осмоса с Weintek HMI по Modbus TCP.
 *
 * Что делает:
 * 1) Читает выбранные 4x holding-адреса (по карте ниже и/или WEINTEK_EXTRA_MAP)
 * 2) Пишет HTML/CSV отчёт и (опционально) дамп/скан ненулевых регистров
 * 3) Читает дискрет 1x-100 (FC02) → M19 (проверка связи)
 *
 * Запуск:
 *   npm run read-weintek-osmos
 *
 * Важно про адреса:
 * - Weintek в таблице привязки показывает "человеческие" 4x-9240.
 * - Modbus PDU обычно 0-based, поэтому по умолчанию используем оффсет -1
 *   (т.е. 4x-9240 читается как PDU 9239). Настраивается переменной WEINTEK_HOLDING_PDU_OFFSET.
 */

import { writeFileSync } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import ModbusRTU from 'modbus-serial';

// ============================================
// Константы и утилиты
// ============================================

const MODBUS_READ_MAX = 124;

function safeWriteFile(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf-8');
}

function csvEscape(s: string): string {
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseIntEnv(name: string, def: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function parseBoolEnv(name: string, def: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return def;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function parseHoldingPduOffset(): number {
  return parseIntEnv('WEINTEK_HOLDING_PDU_OFFSET', -1);
}

function parseInputPduOffset(): number {
  return parseIntEnv('WEINTEK_INPUT_PDU_OFFSET', -1);
}

function parseUnits(): number[] {
  const raw = process.env.WEINTEK_UNITS?.trim();
  if (raw) {
    const parsed = raw
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    return parsed.length ? parsed : [1];
  }
  return [parseIntEnv('WEINTEK_UNIT', 1)];
}

type ScanRange = { from: number; to: number };

function parseScanConfig(): { enabled: boolean; range: ScanRange } {
  if (process.env.WEINTEK_SCAN?.trim() === '0') {
    return { enabled: false, range: { from: 0, to: 0 } };
  }
  const raw = process.env.WEINTEK_SCAN_RANGE?.trim();
  if (raw) {
    const m = raw.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const from = parseInt(m[1], 10);
      const to = parseInt(m[2], 10);
      if (Number.isFinite(from) && Number.isFinite(to) && from <= to) {
        return { enabled: true, range: { from, to } };
      }
    }
  }
  return { enabled: true, range: { from: 0, to: 19999 } };
}

function parseFindValues(): number[] {
  const raw = process.env.WEINTEK_FIND?.trim();
  if (!raw) return [];
  const out = raw
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  return Array.from(new Set(out));
}

// ============================================
// Пути вывода
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function resolveOutPaths(): {
  csv: string;
  holdingCsv: string;
  html: string;
  scanCsv: string;
} {
  const outRaw = process.env.WEINTEK_OUT?.trim();
  const base = outRaw ? (isAbsolute(outRaw) ? outRaw : join(projectRoot, outRaw)) : join(projectRoot, 'weintek-osmos-last.csv');

  const dir = dirname(base);
  let stem = basename(base);
  if (stem.toLowerCase().endsWith('.csv')) stem = stem.slice(0, -4);
  if (stem.toLowerCase().endsWith('.html')) stem = stem.slice(0, -5);
  if (!stem) stem = 'weintek-osmos-last';

  return {
    csv: join(dir, `${stem}.csv`),
    holdingCsv: join(dir, `${stem}-holding.csv`),
    html: join(dir, `${stem}.html`),
    scanCsv: join(dir, `${stem}-scan-nonzero.csv`),
  };
}

// ============================================
// Карта параметров (4x holding)
// ============================================

type ParamDef = {
  reg4x: number;
  plcD: number;
  name: string;
  words: 1 | 2;
  scale?: number;
  unit?: string;
  decimals?: number;
};

// Давления: D.. (16-bit signed), отображение 1 знак после запятой → scale 0.1 бар
const BASE_PARAMS: ParamDef[] = [
  { reg4x: 9240, plcD: 60, name: 'Давление №1 (до фильтра)', words: 1, scale: 0.1, unit: 'бар', decimals: 1 },
  { reg4x: 9242, plcD: 62, name: 'Давление №2 (после фильтра)', words: 1, scale: 0.1, unit: 'бар', decimals: 1 },
  { reg4x: 9246, plcD: 64, name: 'Давление №3 (до мембран)', words: 1, scale: 0.1, unit: 'бар', decimals: 1 },
  { reg4x: 9248, plcD: 66, name: 'Давление №4 (после мембран)', words: 1, scale: 0.1, unit: 'бар', decimals: 1 },
  // Протоки: по умолчанию считаем 32-bit signed с 1 знаком после запятой (как часто делают на HMI).
  // Если на вашей панели иначе — переопределяйте через WEINTEK_EXTRA_MAP.
  { reg4x: 9252, plcD: 530, name: 'Проток №1', words: 2, scale: 0.1, decimals: 1 },
  { reg4x: 9254, plcD: 532, name: 'Проток №2', words: 2, scale: 0.1, decimals: 1 },
  { reg4x: 9256, plcD: 534, name: 'Проток №3 (исходная вода)', words: 2, scale: 0.1, decimals: 1 },
  { reg4x: 9258, plcD: 90, name: 'Проводимость', words: 1, scale: 1, unit: 'мкСм', decimals: 0 },
  { reg4x: 9260, plcD: 140, name: 'Температура', words: 1, scale: 0.1, unit: '°C', decimals: 1 },
];

type ExtraMapEntry = { plcD: number; reg4x: number; words: 1 | 2; scale?: number; unit?: string; decimals?: number };

function parseExtraMap(): ExtraMapEntry[] {
  // Формат:
  //   WEINTEK_EXTRA_MAP="D510=9262:2:0.1:бар:1;D512=9264:2:0.1:бар:1"
  const raw = process.env.WEINTEK_EXTRA_MAP?.trim();
  if (!raw) return [];
  const out: ExtraMapEntry[] = [];
  for (const part of raw.split(/[;]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^D(\d+)\s*=\s*(\d+)(?::([12]))?(?::([0-9.]+))?(?::([^:]+))?(?::(\d+))?$/i);
    if (!m) continue;
    const plcD = parseInt(m[1], 10);
    const reg4x = parseInt(m[2], 10);
    const words = (m[3] ? parseInt(m[3], 10) : 1) as 1 | 2;
    const scale = m[4] ? parseFloat(m[4]) : undefined;
    const unit = m[5]?.trim() || undefined;
    const decimals = m[6] ? parseInt(m[6], 10) : undefined;
    if (!Number.isFinite(plcD) || !Number.isFinite(reg4x)) continue;
    out.push({ plcD, reg4x, words, scale, unit, decimals });
  }
  return out;
}

function buildParams(): ParamDef[] {
  const extra = parseExtraMap().map((e): ParamDef => ({
    reg4x: e.reg4x,
    plcD: e.plcD,
    name: `Параметр (D${e.plcD})`,
    words: e.words,
    scale: e.scale,
    unit: e.unit,
    decimals: e.decimals,
  }));
  const all = [...BASE_PARAMS, ...extra];
  // уникализируем по reg4x (extra должен перезаписать base при совпадении)
  const byReg = new Map<number, ParamDef>();
  for (const p of all) byReg.set(p.reg4x, p);
  return Array.from(byReg.values()).sort((a, b) => a.reg4x - b.reg4x);
}

// ============================================
// Modbus чтение
// ============================================

async function tryReadHolding(client: ModbusRTU, start4x: number, length: number): Promise<number[] | null> {
  try {
    const pduStart = start4x + parseHoldingPduOffset();
    if (pduStart < 0) return null;
    const res = await client.readHoldingRegisters(pduStart, length);
    return res.data;
  } catch {
    return null;
  }
}

async function tryReadDiscrete(client: ModbusRTU, pduStart: number, lengthBits: number): Promise<boolean[] | null> {
  try {
    const res = await client.readDiscreteInputs(pduStart, lengthBits);
    return res.data;
  } catch {
    return null;
  }
}

type DiscreteReadResult = { modbus1x: number; pduAddress: number; plcM: number; value: boolean | null };

const OSMOS_DISCRETE_1X = 100;
const OSMOS_DISCRETE_M = 19;
const OSMOS_DISCRETE_LABEL = 'Дискрет связи/состояния (M19)';

async function readOsmosisDiscrete(client: ModbusRTU): Promise<DiscreteReadResult> {
  const base: DiscreteReadResult = {
    modbus1x: OSMOS_DISCRETE_1X,
    pduAddress: OSMOS_DISCRETE_1X - 1,
    plcM: OSMOS_DISCRETE_M,
    value: null,
  };
  const env = process.env.WEINTEK_1X_PDU?.trim();
  const candidates = env ? [parseInt(env, 10)] : [OSMOS_DISCRETE_1X - 1, OSMOS_DISCRETE_1X];
  let last = base.pduAddress;
  for (const pdu of candidates) {
    if (!Number.isFinite(pdu) || pdu < 0) continue;
    last = pdu;
    const bits = await tryReadDiscrete(client, pdu, 1);
    if (bits && bits.length) return { ...base, pduAddress: pdu, value: bits[0] };
  }
  return { ...base, pduAddress: last, value: null };
}

// ============================================
// Декодирование значений
// ============================================

function toInt16(u16: number): number {
  const u = u16 & 0xffff;
  return u > 32767 ? u - 65536 : u;
}

function toInt32FromWordsLoHi(lo: number, hi: number): { i32: number; u32: number } {
  const u32 = (((hi & 0xffff) << 16) | (lo & 0xffff)) >>> 0;
  const i32 = u32 > 0x7fffffff ? u32 - 0x1_0000_0000 : u32;
  return { i32, u32 };
}

function fmtScaled(value: number, decimals?: number): string {
  if (typeof decimals === 'number' && Number.isFinite(decimals)) {
    return value.toFixed(decimals);
  }
  return String(value);
}

type ParamRow = {
  reg4x: number;
  plcD: string;
  name: string;
  words: 1 | 2;
  rawInt16: number;
  rawUInt16: number;
  rawInt32: number | null;
  rawUInt32: number | null;
  scaled: string | null;
  unit: string | null;
};

function buildParamRowFromWords(p: ParamDef, words: number[] | null): ParamRow {
  const miss: ParamRow = {
    reg4x: p.reg4x,
    plcD: `D${p.plcD}`,
    name: p.name,
    words: p.words,
    rawInt16: NaN,
    rawUInt16: NaN,
    rawInt32: null,
    rawUInt32: null,
    scaled: null,
    unit: p.unit ?? null,
  };
  if (!words || words.length < 1) {
    return miss;
  }
  const u0 = words[0] & 0xffff;
  const int16 = toInt16(u0);
  if (p.words === 1) {
    const scaled = typeof p.scale === 'number' ? fmtScaled(int16 * p.scale, p.decimals) : null;
    return { ...miss, rawInt16: int16, rawUInt16: u0, scaled };
  }
  if (words.length < 2) {
    return { ...miss, rawInt16: int16, rawUInt16: u0 };
  }
  const u1 = words[1] & 0xffff;
  const { i32, u32 } = toInt32FromWordsLoHi(u0, u1);
  const scaled = typeof p.scale === 'number' ? fmtScaled(i32 * p.scale, p.decimals) : String(i32);
  return { ...miss, rawInt16: int16, rawUInt16: u0, rawInt32: i32, rawUInt32: u32, scaled };
}

async function readParamRows(client: ModbusRTU, params: ParamDef[]): Promise<ParamRow[]> {
  // Weintek MODBUS Server может отдавать разные значения при блочном чтении.
  // Чтобы исключить "дыры" (как с температурой 9260), читаем каждую точку отдельно.
  const out: ParamRow[] = [];
  for (const p of params) {
    const words = await tryReadHolding(client, p.reg4x, p.words);
    out.push(buildParamRowFromWords(p, words));
  }
  return out;
}

async function readHoldingRangeWords(
  client: ModbusRTU,
  from4x: number,
  length: number,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const a = from4x + i;
    const one = await tryReadHolding(client, a, 1);
    out.push(one && one.length ? (one[0] & 0xffff) : 0);
  }
  return out;
}

// ============================================
// Отчёты
// ============================================

function writeParametersCsv(filePath: string, meta: { host: string; port: number; unitId: number }, rows: ParamRow[]): void {
  const lines = [
    `# Modbus ${meta.host}:${meta.port} slave=${meta.unitId}`,
    `# ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} MSK`,
    '№;Адрес_4x;ПЛК_D;Параметр;Words;Raw_int16;Raw_uint16;Raw_int32;Raw_uint32;Scaled;Unit',
    ...rows.map((r, idx) => {
      const scaled = r.scaled ?? '';
      return [
        String(idx + 1),
        String(r.reg4x),
        csvEscape(r.plcD),
        csvEscape(r.name),
        String(r.words),
        Number.isFinite(r.rawInt16) ? String(r.rawInt16) : '',
        Number.isFinite(r.rawUInt16) ? String(r.rawUInt16) : '',
        r.rawInt32 === null ? '' : String(r.rawInt32),
        r.rawUInt32 === null ? '' : String(r.rawUInt32),
        scaled ? csvEscape(scaled) : '',
        r.unit ? csvEscape(r.unit) : '',
      ].join(';');
    }),
  ];
  safeWriteFile(filePath, `\uFEFF${lines.join('\n')}`);
}

function writeScanNonzeroCsv(
  filePath: string,
  meta: { host: string; port: number; unitId: number; scanFrom: number; scanTo: number },
  entries: { addr: number; value: number }[],
): void {
  const lines = [
    `# Holding registers: только ненулевые 16-bit слова`,
    `# ${meta.host}:${meta.port} slave=${meta.unitId}, диапазон ${meta.scanFrom}…${meta.scanTo}`,
    `# ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} MSK`,
    'Адрес;Decimal_signed;UInt16;Hex',
    ...entries.map((e) => {
      const u = e.value & 0xffff;
      const signed = u > 32767 ? u - 65536 : u;
      return `${e.addr};${signed};${u};0x${u.toString(16).toUpperCase().padStart(4, '0')}`;
    }),
  ];
  safeWriteFile(filePath, `\uFEFF${lines.join('\n')}`);
}

function writeHoldingDumpCsv(filePath: string, meta: { host: string; port: number; unitId: number; baseReg: number }, words: number[]): void {
  const lines = [
    `# Полный снимок Holding registers (одно слово = 16 bit)`,
    `# ${meta.host}:${meta.port} slave=${meta.unitId}`,
    `# ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} MSK`,
    'Адрес_Holding;UInt16;Hex_16bit',
    ...words.map((val, i) => {
      const addr = meta.baseReg + i;
      const u = val & 0xffff;
      return `${addr};${u};0x${u.toString(16).toUpperCase().padStart(4, '0')}`;
    }),
  ];
  safeWriteFile(filePath, `\uFEFF${lines.join('\n')}`);
}

function writeHtmlReport(
  filePath: string,
  meta: { host: string; port: number; unitId: number; baseReg: number },
  rows: ParamRow[],
  scanNonzero: { addr: number; value: number }[] | null,
  scanRange: ScanRange | null,
  discrete: DiscreteReadResult,
): void {
  const paramRowsHtml = rows
    .map((r, idx) => {
      const scaled = r.scaled ? `${escapeHtml(r.scaled)}${r.unit ? ` ${escapeHtml(r.unit)}` : ''}` : '—';
      return `<tr>
  <td>${idx + 1}</td>
  <td>${r.reg4x}</td>
  <td>${escapeHtml(r.plcD)}</td>
  <td class="name">${escapeHtml(r.name)}</td>
  <td class="num">${r.words}</td>
  <td class="num">${Number.isFinite(r.rawInt16) ? r.rawInt16 : '—'}</td>
  <td class="num">${Number.isFinite(r.rawUInt16) ? r.rawUInt16 : '—'}</td>
  <td class="num">${r.rawInt32 === null ? '—' : r.rawInt32}</td>
  <td class="num">${scaled}</td>
</tr>`;
    })
    .join('\n');

  const discreteVal = discrete.value === null ? 'нет ответа' : discrete.value ? '1 (ON)' : '0 (OFF)';

  const scanBlock =
    scanNonzero && scanRange
      ? `<section class="block" id="scan">
  <h2>Скан: ненулевые Holding (${scanRange.from}…${scanRange.to})</h2>
  <p class="meta">Только адреса, где UInt16 ≠ 0. Файл: <code>*-scan-nonzero.csv</code></p>
</section>`
      : '';

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ОСМОС Modbus — ${escapeHtml(meta.host)}</title>
  <style>
    :root { --bg:#0b1220; --card:#0f1b33; --text:#e5e7eb; --muted:#9ca3af; --border:#22304d; --accent:#60a5fa; }
    body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--text); }
    header { padding: 18px 20px; border-bottom:1px solid var(--border); background: linear-gradient(135deg, #0f1b33, #13254a); }
    header h1 { margin:0 0 6px; font-size: 18px; }
    header .sub { color: var(--muted); font-size: 13px; }
    main { padding: 18px 16px 40px; max-width: 1400px; margin: 0 auto; }
    .block { margin-top: 18px; }
    .block h2 { margin: 0 0 8px; font-size: 15px; color: #dbeafe; }
    .meta { margin:0 0 10px; color: var(--muted); font-size: 13px; }
    .table-wrap { border:1px solid var(--border); border-radius: 10px; overflow:auto; background: var(--card); }
    table { border-collapse: collapse; width: 100%; min-width: 900px; font-size: 13px; }
    th, td { border-bottom:1px solid var(--border); padding: 10px 12px; text-align:left; vertical-align: top; }
    thead th { position: sticky; top: 0; background: #102042; z-index: 1; }
    td.num { font-family: ui-monospace, "Cascadia Code", monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.name { max-width: 420px; }
    code { background: #0b1220; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <header>
    <h1>Обратный осмос — отчёт Modbus</h1>
    <div class="sub">${escapeHtml(meta.host)}:${meta.port} · slave <strong>${meta.unitId}</strong> · база <strong>${meta.baseReg}</strong> · PDU offset holding <strong>${parseHoldingPduOffset()}</strong> · ${escapeHtml(
      new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    )} (МСК)</div>
  </header>
  <main>
    <section class="block" id="params">
      <h2>Параметры</h2>
      <p class="meta">D60/D62/D64/D66 — 16-bit signed, 1 знак после запятой ⇒ scale 0.1 бар. D510 (по скрину) — 32-bit signed (2 слова).</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>№</th><th>4x</th><th>ПЛК D</th><th>Параметр</th><th>words</th><th>int16</th><th>uint16</th><th>int32</th><th>scaled</th></tr></thead>
          <tbody>
${paramRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <section class="block" id="discrete">
      <h2>Дискрет 1x</h2>
      <p class="meta"><strong>${escapeHtml(OSMOS_DISCRETE_LABEL)}</strong>: 1x-${discrete.modbus1x} → M${discrete.plcM} (FC02). PDU=${discrete.pduAddress}. Значение: <strong>${escapeHtml(discreteVal)}</strong>.</p>
    </section>

    ${scanBlock}
  </main>
</body>
</html>`;

  safeWriteFile(filePath, html);
}

async function scanNonZeroHolding(client: ModbusRTU, range: ScanRange): Promise<{ addr: number; value: number }[]> {
  const out: { addr: number; value: number }[] = [];
  for (let start = range.from; start <= range.to; start += MODBUS_READ_MAX) {
    const len = Math.min(MODBUS_READ_MAX, range.to - start + 1);
    const data = await tryReadHolding(client, start, len);
    if (!data) continue;
    for (let i = 0; i < data.length; i++) {
      const u = data[i] & 0xffff;
      if (u !== 0) out.push({ addr: start + i, value: u });
    }
  }
  return out;
}

// ============================================
// main
// ============================================

async function main(): Promise<void> {
  const host = process.env.WEINTEK_HOST ?? '192.168.6.227';
  const port = parseIntEnv('WEINTEK_PORT', 502);
  const units = parseUnits();
  const scan = parseScanConfig();
  const findValues = parseFindValues();
  const htmlOnly = parseBoolEnv('WEINTEK_HTML_ONLY', false);
  const { csv, holdingCsv, html, scanCsv } = resolveOutPaths();

  console.log(`Modbus TCP → ${host}:${port}, unit ID: ${units.join(', ')}`);
  console.log(`PDU offset (holding): ${parseHoldingPduOffset()} (WEINTEK_HOLDING_PDU_OFFSET)`);
  if (scan.enabled) console.log(`Скан диапазон: ${scan.range.from}…${scan.range.to} (WEINTEK_SCAN_RANGE / WEINTEK_SCAN=0)`);
  if (findValues.length) console.log(`Поиск UInt16 во время скана: ${findValues.join(', ')} (WEINTEK_FIND)`);
  console.log('---');

  const client = new ModbusRTU();
  client.setTimeout(8000);
  await client.connectTCP(host, { port });

  try {
    const params = buildParams();
    const base4x = Math.min(...params.map((p) => p.reg4x)) - 4;
    const length = Math.max(...params.map((p) => p.reg4x + (p.words === 2 ? 1 : 0))) - base4x + 1;

    for (const unitId of units) {
      client.setID(unitId);
      console.log(`\n[Unit ID ${unitId}]`);

      const discrete = await readOsmosisDiscrete(client);
      console.log(
        discrete.value === null
          ? `${OSMOS_DISCRETE_LABEL}: 1x-${discrete.modbus1x} → M${discrete.plcM}: нет ответа`
          : `${OSMOS_DISCRETE_LABEL}: 1x-${discrete.modbus1x} (PDU ${discrete.pduAddress}) → M${discrete.plcM}: ${discrete.value ? 1 : 0}`,
      );

      const rows = await readParamRows(client, params);
      const rangeWords = await readHoldingRangeWords(client, base4x, length);

      let scanNonzero: { addr: number; value: number }[] | null = null;
      let scanRange: ScanRange | null = null;
      if (scan.enabled) {
        console.log(`\nСкан Holding ${scan.range.from}…${scan.range.to}…`);
        client.setTimeout(20000);
        scanNonzero = await scanNonZeroHolding(client, scan.range);
        scanRange = scan.range;
        client.setTimeout(8000);
        console.log(`Найдено ненулевых 16-bit слов: ${scanNonzero.length}`);
        if (findValues.length) {
          const matches = scanNonzero.filter((e) => findValues.includes(e.value & 0xffff));
          if (matches.length) {
            console.log(`Совпадения по WEINTEK_FIND в Holding: ${matches.length}`);
            console.table(matches.map((e) => ({ addr: e.addr, uint16: e.value & 0xffff })));
          } else {
            console.log('Совпадений по WEINTEK_FIND в Holding не найдено.');
          }
        }
        if (!htmlOnly) {
          writeScanNonzeroCsv(scanCsv, { host, port, unitId, scanFrom: scan.range.from, scanTo: scan.range.to }, scanNonzero);
        }
      }

      writeHtmlReport(html, { host, port, unitId, baseReg: base4x }, rows, scanNonzero, scanRange, discrete);
      if (!htmlOnly) {
        writeParametersCsv(csv, { host, port, unitId }, rows);
        writeHoldingDumpCsv(holdingCsv, { host, port, unitId, baseReg: base4x }, rangeWords);
      }

      console.log('\nКратко (полная таблица — в HTML):\n');
      console.table(
        rows.map((r) => ({
          x4: r.reg4x,
          plc: r.plcD,
          name: r.name,
          words: r.words,
          int16: Number.isFinite(r.rawInt16) ? r.rawInt16 : '—',
          int32: r.rawInt32 ?? '—',
          scaled: r.scaled ? `${r.scaled}${r.unit ? ` ${r.unit}` : ''}` : '—',
        })),
      );
      console.log(`\nСохранено: ${html}${htmlOnly ? '' : `; ${csv}; ${holdingCsv}${scan.enabled ? `; ${scanCsv}` : ''}`}`);
    }
  } finally {
    await new Promise<void>((resolve) => client.close(() => resolve()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
