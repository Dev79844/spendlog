/**
 * CSV interchange format for expenses and categories.
 *
 * Pure TypeScript whose only import is the pure `./date`, so it runs under
 * plain Node (`npm test`) as well as in the app. All database access lives
 * in `lib/db/csv.ts`.
 *
 * Format: one UTF-8 file (with BOM), RFC 4180 quoting, CRLF line endings.
 * Every expense is one `expense` row. Every category, including unused and
 * deleted (inactive) ones, is also one `category` row at the end of the file,
 * so the export is a complete backup in a single file the share sheet can send.
 * The database stores epoch milliseconds (see lib/date.ts). Export converts
 * them to `YYYY-MM-DD` dates (local calendar day) and ISO 8601 UTC
 * timestamps, the stable interchange format. Import is lenient about date and
 * time formats and converts every value back to epoch ms with the same
 * parsers the schema migration uses, so imported rows are stored exactly like
 * migrated ones.
 */

import { parseExpenseDay, parseTimestamp, toDayKey } from './date';

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

// Epoch ms values as stored in SQLite.
export interface CsvExportExpense {
  id: number;
  date: number;
  amount: number;
  category: string;
  category_color: string | null;
  category_icon: string | null;
  location: string | null;
  description: string | null;
  metadata: string | null;
  created_at: number | null;
  updated_at: number | null;
}

export interface CsvExportCategory {
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: number | null;
}

// Values converted to what the database stores: `date` is local noon of the
// day (parseExpenseDay), timestamps are epoch ms (null when the cell is empty).
export interface CsvImportExpense {
  row: number;
  id: number | null;
  date: number;
  amount: number;
  category: string;
  category_color: string | null;
  category_icon: string | null;
  location: string | null;
  description: string | null;
  metadata: string | null;
  created_at: number | null;
  updated_at: number | null;
}

export interface CsvImportCategory {
  row: number;
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: number | null;
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
// re-saved by a spreadsheet, still load. The accepted formats and the parsing
// live in lib/date.ts (parseExpenseDay / parseTimestamp), shared with the
// schema migration.

export const ACCEPTED_DATE_FORMATS =
  'YYYY-MM-DD, an ISO 8601 date-time (2026-05-27T09:57:00Z, with an offset like +05:30, or no zone for local time), YYYY-MM-DD HH:MM:SS (UTC), or epoch seconds (10 digits) / milliseconds (13 digits)';

const SLASHED_DMY_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

/** A `date` value as the local calendar day `YYYY-MM-DD`. Null if unparseable. */
export function parseDateValue(value: string): string | null {
  const ms = parseExpenseDay(value);
  return ms === null ? null : toDayKey(ms);
}

/** A timestamp value as ISO 8601 UTC. Null if unparseable. */
export function toIsoTimestamp(value: string): string | null {
  const ms = parseTimestamp(value);
  return ms === null ? null : new Date(ms).toISOString();
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
  date: number;
  amount: number;
  category: string;
  description: string | null;
}): string {
  return JSON.stringify([toDayKey(e.date), e.amount, e.category.trim().toLowerCase(), e.description ?? '']);
}

// ---------------------------------------------------------------------------
// Export

export function buildExportCsv(
  expenses: CsvExportExpense[],
  categories: CsvExportCategory[]
): string {
  const ts = (v: number | null) => (v === null ? '' : new Date(v).toISOString());
  const rows: string[][] = [[...CSV_COLUMNS]];

  for (const e of expenses) {
    const record: Record<CsvColumn, string> = {
      id: String(e.id),
      date: toDayKey(e.date),
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
      const ms = parseTimestamp(raw);
      if (ms === null) errors.push(dateValueError(c, raw));
      return ms;
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
    const date = parseExpenseDay(dateRaw);
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
