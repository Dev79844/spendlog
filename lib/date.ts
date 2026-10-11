// Date helpers for the UI boundary.
//
// Storage format: every date/time column is INTEGER epoch milliseconds (what
// `Date.now()` returns). An expense's `date` is a calendar day, stored as
// local noon of that day (see `toExpenseDay`). Everything here uses the
// device's local timezone; nothing should call `toISOString()` to get a day.
//
// Pure and import-free: Node runs it in `npm test` and `npm run verify-migrations`.

const pad = (n: number) => String(n).padStart(2, '0');

// Expense days are pinned to local noon: it is never skipped by a DST change
// (those happen around midnight) and stays on the same calendar day if the
// device's timezone later moves by up to ±11 hours.
export function toExpenseDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime();
}

// 'YYYY-MM-DD' in local time, for grouping and keys.
export function toDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM' in local time.
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function getCurrentMonth(): string {
  return toMonthKey(new Date());
}

function parseMonthKey(month: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month key: ${month}`);
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

// Local start of the month (inclusive) and start of the next month (exclusive).
export function getMonthRange(month: string): { start: number; end: number } {
  const { year, monthIndex } = parseMonthKey(month);
  return {
    start: new Date(year, monthIndex, 1).getTime(),
    end: new Date(year, monthIndex + 1, 1).getTime(),
  };
}

// First day of the month as a local Date, for formatting month labels.
export function monthKeyToDate(month: string): Date {
  const { year, monthIndex } = parseMonthKey(month);
  return new Date(year, monthIndex, 1);
}

// ---------------------------------------------------------------------------
// Parsing date and time text into stored values.
//
// This is the one place that turns text into stored epoch values. Both the
// schema migration (lib/db/migrations.ts, converting the old TEXT columns)
// and CSV import (lib/csv.ts) call it, so a migrated row and an imported row
// are stored identically. Changing these rules changes what migration 1 does
// on phones that have not run it yet: run `npm run verify-migrations` and
// `npm test` after any change.
//
// Accepted:
//   2026-05-27                    calendar day
//   2026/05/27                    calendar day
//   2026-05-27T09:57[:00[.123]]   local time (device timezone)
//   2026-05-27T09:57:00Z          UTC; also +05:30, +0530, +05 offsets
//   2026-05-27 09:57:00           UTC (SQLite CURRENT_TIMESTAMP), or with an offset
//   1779875820                    epoch seconds (10 digits)
//   1779875820000                 epoch milliseconds (13 digits)
// `DD/MM/YYYY` and `MM/DD/YYYY` are rejected: the order can't be known safely.

const DATE_TIME_RE =
  /^(\d{4})[-/](\d{2})[-/](\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

// A parsed value: wall-clock fields in the device's timezone (no zone given)
// or an exact instant.
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

// An expense `date` value: the local calendar day it names (for an instant,
// the day it falls on in the device's timezone), stored as local noon like
// `toExpenseDay`. Null if unparseable.
export function parseExpenseDay(value: string): number | null {
  const when = parseWhen(value);
  if (!when) return null;
  if (when.kind === 'local') return new Date(when.y, when.mo - 1, when.d, 12).getTime();
  const date = new Date(when.time);
  return Number.isNaN(date.getTime()) ? null : toExpenseDay(date);
}

// A `created_at` / `updated_at` value as epoch ms. A value without a zone is
// local time (a bare date is local midnight), except `YYYY-MM-DD HH:MM:SS`,
// which is SQLite's UTC form. Null if unparseable.
export function parseTimestamp(value: string): number | null {
  const when = parseWhen(value);
  if (!when) return null;
  const time =
    when.kind === 'instant'
      ? when.time
      : new Date(when.y, when.mo - 1, when.d, when.h, when.mi, when.s, when.ms).getTime();
  return Number.isNaN(time) ? null : time;
}
