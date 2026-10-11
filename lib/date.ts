// Date helpers for the UI boundary.
//
// Storage format: every date/time column is INTEGER epoch milliseconds (what
// `Date.now()` returns). An expense's `date` is a calendar day, stored as
// local noon of that day (see `toExpenseDay`). Everything here uses the
// device's local timezone; nothing should call `toISOString()` to get a day.

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
