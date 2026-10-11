/**
 * CSV interchange format for expenses and categories.
 *
 * Pure TypeScript with no imports, so it runs under plain Node
 * (`npm test`) as well as in the app. All database access lives in
 * `lib/db/csv.ts`.
 *
 * Format: one UTF-8 file (with BOM), RFC 4180 quoting, CRLF line endings.
 * Every expense is one `expense` row. Every category, including unused and
 * deleted (inactive) ones, is also one `category` row at the end of the file,
 * so the export is a complete backup in a single file the share sheet can send.
 * Export writes dates as `YYYY-MM-DD` and timestamps as ISO 8601 UTC,
 * independent of how the database stores them. Import is lenient about date
 * and time formats (see "Dates and timestamps" below).
 */

export const CSV_COLUMNS = [
  'id',
  'date',
  'amount',
  'category',
  'category_color',
  'category_icon',
  'location',
  'description',
  'metadata',
  'created_at',
  'updated_at',
  'record_type',
  'category_active',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvExportExpense {
  id: number;
  date: string;
  amount: number;
  category: string;
  category_color: string | null;
  category_icon: string | null;
  location: string | null;
  description: string | null;
  metadata: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CsvExportCategory {
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: string | null;
}

export interface CsvImportExpense {
  row: number;
  id: number | null;
  date: string;
  amount: number;
  category: string;
  category_color: string | null;
  category_icon: string | null;
  location: string | null;
  description: string | null;
  metadata: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CsvImportCategory {
  row: number;
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: string | null;
}

export interface CsvRowError {
  /** 1-based record number in the file; the header is row 1. 0 = whole file. */
  row: number;
  message: string;
}

export interface CsvImportResult {
  expenses: CsvImportExpense[];
  categories: CsvImportCategory[];
  errors: CsvRowError[];
}

const BOM = '﻿';

// ---------------------------------------------------------------------------
// Low-level CSV

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * Parses RFC 4180 CSV: quoted fields with `""` escapes and embedded
 * newlines, CRLF / LF / CR line endings, optional UTF-8 BOM. Blank lines are
 * skipped. Throws on an unterminated quoted field.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoted = false; // current field started with a quote
  let rowQuoted = false; // current row has a quoted field (so it isn't blank)

  const endField = () => {
    row.push(field);
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    const blank = row.length === 1 && row[0] === '' && !rowQuoted;
    if (!blank) rows.push(row);
    row = [];
    rowQuoted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
      rowQuoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRow();
    } else {
      // Text after a closing quote (`"a"b`) is kept literally, as most readers do.
      field += ch;
    }
  }
  if (inQuotes) {
    throw new Error('Unterminated quoted field: the file looks truncated or malformed.');
  }
  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

// ---------------------------------------------------------------------------
// Values

const AMOUNT_RE = /^(\d+(\.\d*)?|\.\d+)$/;
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Returns the amount as a number, or null unless it is a plain positive decimal. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!AMOUNT_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Dates and timestamps
//
// Import is lenient so files from older and newer app versions, and sheets
// re-saved by a spreadsheet, still load. Accepted, for `date` and the
// timestamp columns alike:
//   2026-05-27                    calendar day
//   2026/05/27                    calendar day
//   2026-05-27T09:57[:00[.123]]   local time (device timezone)
//   2026-05-27T09:57:00Z          UTC; also +05:30, +0530, +05 offsets
//   2026-05-27 09:57:00           UTC (SQLite CURRENT_TIMESTAMP), or with an offset
//   1779875820                    epoch seconds (10 digits)
//   1779875820000                 epoch milliseconds (13 digits)
// `DD/MM/YYYY` and `MM/DD/YYYY` are rejected: the order can't be known safely.

export const ACCEPTED_DATE_FORMATS =
  'YYYY-MM-DD, an ISO 8601 date-time (2026-05-27T09:57:00Z, with an offset like +05:30, or no zone for local time), YYYY-MM-DD HH:MM:SS (UTC), or epoch seconds (10 digits) / milliseconds (13 digits)';

const DATE_TIME_RE =
  /^(\d{4})[-/](\d{2})[-/](\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const SLASHED_DMY_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

/**
 * A parsed date or timestamp: either wall-clock fields in the device's
 * timezone (no zone given) or an exact instant.
 */
type When =
  | { kind: 'local'; y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }
  | { kind: 'instant'; time: number };

function isValidDay(y: number, mo: number, d: number): boolean {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    y >= 1000 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

function parseWhen(value: string): When | null {
  const v = value.trim();
  if (/^\d{10}$/.test(v)) return { kind: 'instant', time: Number(v) * 1000 };
  if (/^\d{13}$/.test(v)) return { kind: 'instant', time: Number(v) };

  const m = DATE_TIME_RE.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hasTime = m[4] !== undefined;
  const [h, mi, s] = [Number(m[5] ?? 0), Number(m[6] ?? 0), Number(m[7] ?? 0)];
  const ms = Number((m[8] ?? '').slice(0, 3).padEnd(3, '0'));
  const zone = m[9];
  if (!isValidDay(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
  if (zone && !hasTime) return null;

  if (!zone && m[4] !== ' ') return { kind: 'local', y, mo, d, h, mi, s, ms };

  // A space-separated time without a zone is SQLite's CURRENT_TIMESTAMP: UTC.
  let offsetMinutes = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2) || 0);
    if (oh > 14 || om > 59) return null;
    offsetMinutes = (zone[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  return { kind: 'instant', time: Date.UTC(y, mo - 1, d, h, mi, s, ms) - offsetMinutes * 60_000 };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Parses a `date` value to the local calendar day `YYYY-MM-DD` (the device's
 * timezone decides which day an instant falls on). Null if unparseable.
 */
export function parseDateValue(value: string): string | null {
  const when = parseWhen(value);
  if (!when) return null;
  if (when.kind === 'local') return `${pad(when.y, 4)}-${pad(when.mo)}-${pad(when.d)}`;
  const date = new Date(when.time);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parses a timestamp value to ISO 8601 UTC. A value without a zone is local
 * time (a bare date is local midnight), except `YYYY-MM-DD HH:MM:SS`, which is
 * SQLite's UTC form. Null if unparseable.
 */
export function toIsoTimestamp(value: string): string | null {
  const when = parseWhen(value);
  if (!when) return null;
  const date =
    when.kind === 'instant'
      ? new Date(when.time)
      : new Date(when.y, when.mo - 1, when.d, when.h, when.mi, when.s, when.ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The error for an unparseable date or timestamp in `column`. */
export function dateValueError(column: string, value: string): string {
  const reason = SLASHED_DMY_RE.test(value.trim())
    ? "is ambiguous: day/month order can't be told apart safely"
    : 'is not a recognised date';
  return `${column} "${value}" ${reason}. Use ${ACCEPTED_DATE_FORMATS}.`;
}

/** `spendlog-export-YYYYMMDD-HHMM.csv` in local time. */
export function exportFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  return `spendlog-export-${date}-${p(now.getHours())}${p(now.getMinutes())}.csv`;
}

/**
 * Identity of an expense for duplicate detection on import: same date, amount,
 * category (case-insensitive) and description.
 */
export function expenseDuplicateKey(e: {
  date: string;
  amount: number;
  category: string;
  description: string | null;
}): string {
  return JSON.stringify([e.date, e.amount, e.category.trim().toLowerCase(), e.description ?? '']);
}

// ---------------------------------------------------------------------------
// Export

export function buildExportCsv(
  expenses: CsvExportExpense[],
  categories: CsvExportCategory[]
): string {
  const ts = (v: string | null) => (v ? (toIsoTimestamp(v) ?? v) : '');
  const rows: string[][] = [[...CSV_COLUMNS]];

  for (const e of expenses) {
    const record: Record<CsvColumn, string> = {
      id: String(e.id),
      date: e.date,
      amount: String(e.amount),
      category: e.category,
      category_color: e.category_color ?? '',
      category_icon: e.category_icon ?? '',
      location: e.location ?? '',
      description: e.description ?? '',
      metadata: e.metadata ?? '',
      created_at: ts(e.created_at),
      updated_at: ts(e.updated_at),
      record_type: 'expense',
      category_active: '',
    };
    rows.push(CSV_COLUMNS.map((c) => record[c]));
  }

  for (const c of categories) {
    const record: Record<CsvColumn, string> = {
      id: '',
      date: '',
      amount: '',
      category: c.name,
      category_color: c.color ?? '',
      category_icon: c.icon ?? '',
      location: '',
      description: '',
      metadata: '',
      created_at: ts(c.created_at),
      updated_at: '',
      record_type: 'category',
      category_active: c.is_active === 1 ? '1' : '0',
    };
    rows.push(CSV_COLUMNS.map((col) => record[col]));
  }

  return BOM + serializeCsv(rows);
}

// ---------------------------------------------------------------------------
// Import

const HEADER_ALIASES: Record<string, CsvColumn> = {
  category_name: 'category',
  type: 'record_type',
};

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Parses and validates an import file. Accepts the app's own export as well as
 * a hand-made sheet with at least `date`, `amount` and `category` columns (in
 * any order; unknown columns are ignored). Rows without `record_type` are
 * expenses. Any error should block the whole import.
 */
export function parseImportCsv(text: string): CsvImportResult {
  const result: CsvImportResult = { expenses: [], categories: [], errors: [] };

  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (error) {
    result.errors.push({ row: 0, message: (error as Error).message });
    return result;
  }
  if (records.length === 0) {
    result.errors.push({ row: 0, message: 'The file is empty.' });
    return result;
  }

  const index = new Map<CsvColumn, number>();
  records[0].forEach((raw, i) => {
    const name = normaliseHeader(raw);
    const column = (CSV_COLUMNS as readonly string[]).includes(name)
      ? (name as CsvColumn)
      : HEADER_ALIASES[name];
    if (column && !index.has(column)) index.set(column, i);
  });
  const missing = (['date', 'amount', 'category'] as const).filter((c) => !index.has(c));
  if (missing.length > 0) {
    result.errors.push({
      row: 1,
      message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
    });
    return result;
  }

  const seenCategories = new Set<string>();

  records.slice(1).forEach((fields, i) => {
    const row = i + 2;
    // Free text (names, location, description, metadata) is kept exactly;
    // structured values are trimmed.
    const raw = (c: CsvColumn) => {
      const at = index.get(c);
      return at === undefined ? '' : (fields[at] ?? '');
    };
    const get = (c: CsvColumn) => raw(c).trim();
    const text = (c: CsvColumn) => raw(c) || null;
    const errors: string[] = [];

    const timestamp = (c: CsvColumn) => {
      const raw = get(c);
      if (!raw) return null;
      const iso = toIsoTimestamp(raw);
      if (!iso) errors.push(dateValueError(c, raw));
      return iso;
    };

    const name = raw('category');
    if (!name.trim()) errors.push('category is empty');
    const color = get('category_color') || null;
    if (color && !COLOR_RE.test(color)) errors.push(`category_color "${color}" is not a hex color`);
    const icon = get('category_icon') || null;

    const type = get('record_type').toLowerCase() || 'expense';

    if (type === 'category') {
      const activeRaw = get('category_active').toLowerCase();
      let isActive = 1;
      if (['0', 'false', 'no'].includes(activeRaw)) isActive = 0;
      else if (!['', '1', 'true', 'yes'].includes(activeRaw)) {
        errors.push(`category_active "${activeRaw}" must be 1 or 0`);
      }
      const key = name.trim().toLowerCase();
      if (name && seenCategories.has(key)) errors.push(`category "${name}" is listed twice`);
      seenCategories.add(key);
      const createdAt = timestamp('created_at');

      if (errors.length > 0) {
        errors.forEach((message) => result.errors.push({ row, message }));
        return;
      }
      result.categories.push({ row, name, color, icon, is_active: isActive, created_at: createdAt });
      return;
    }

    if (type !== 'expense') {
      result.errors.push({ row, message: `record_type "${type}" must be expense or category` });
      return;
    }

    const dateRaw = get('date');
    const date = parseDateValue(dateRaw);
    if (date === null) errors.push(dateValueError('date', dateRaw));
    const amountRaw = get('amount');
    const amount = parseAmount(amountRaw);
    if (amount === null) errors.push(`amount "${amountRaw}" is not a positive number`);
    const idRaw = get('id');
    let id: number | null = null;
    if (idRaw) {
      if (/^\d+$/.test(idRaw) && Number(idRaw) > 0) id = Number(idRaw);
      else errors.push(`id "${idRaw}" is not a positive whole number`);
    }
    const createdAt = timestamp('created_at');
    const updatedAt = timestamp('updated_at');

    if (errors.length > 0 || amount === null || date === null) {
      errors.forEach((message) => result.errors.push({ row, message }));
      return;
    }
    result.expenses.push({
      row,
      id,
      date,
      amount,
      category: name,
      category_color: color,
      category_icon: icon,
      location: text('location'),
      description: text('description'),
      metadata: text('metadata'),
      created_at: createdAt,
      updated_at: updatedAt,
    });
  });

  return result;
}
