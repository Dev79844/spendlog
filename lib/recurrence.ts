// Recurrence schedules: which calendar days a recurring rule falls on.
//
// Every day is a local calendar day stored as local noon (like an expense's
// `date`, see `toExpenseDay` in lib/date.ts). Occurrence n is computed from
// the start date directly, never from occurrence n-1, so month-end clamping
// does not drift: a rule starting on the 31st falls on Jan 31, Feb 28/29,
// Mar 31, Apr 30, ... Local-date arithmetic (new Date(y, m, d, 12)) keeps
// every occurrence at noon across DST changes.
//
// Pure (its only runtime import is ./date) so Node runs it in `npm test`.

import type { Frequency } from './types';
import { toExpenseDay } from './date';

export interface Schedule {
  frequency: Frequency;
  interval: number;
  start_date: number;
  end_date: number | null;
}

export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

// A daily rule that started decades ago still finishes in well under a
// millisecond per thousand steps; this only guards against bad data.
const MAX_STEPS = 100_000;

// Local noon of `day` in month `monthIndex` (may overflow into later years),
// clamped to the month's last day.
function clampedDay(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay), 12).getTime();
}

/** The n-th occurrence (n = 0 is the start date) as local noon. */
export function occurrenceDate(schedule: Schedule, n: number): number {
  const start = new Date(schedule.start_date);
  const [y, m, d] = [start.getFullYear(), start.getMonth(), start.getDate()];
  const step = n * Math.max(1, Math.floor(schedule.interval));
  switch (schedule.frequency) {
    case 'daily':
      return new Date(y, m, d + step, 12).getTime();
    case 'weekly':
      return new Date(y, m, d + 7 * step, 12).getTime();
    case 'monthly':
      return clampedDay(y, m + step, d);
    case 'yearly':
      return clampedDay(y, m + 12 * step, d);
  }
}

/**
 * Occurrences after `after` (exclusive; null = from the start) up to and
 * including `until`, and not past the schedule's end date. Ascending.
 */
export function occurrencesBetween(schedule: Schedule, after: number | null, until: number): number[] {
  const limit = schedule.end_date === null ? until : Math.min(until, schedule.end_date);
  const days: number[] = [];
  for (let n = 0; n < MAX_STEPS; n++) {
    const day = occurrenceDate(schedule, n);
    if (day > limit) break;
    if (after === null || day > after) days.push(day);
  }
  return days;
}

/** The first occurrence after `after` (null = the first one), or null if the schedule has ended. */
export function nextOccurrence(schedule: Schedule, after: number | null): number | null {
  for (let n = 0; n < MAX_STEPS; n++) {
    const day = occurrenceDate(schedule, n);
    if (schedule.end_date !== null && day > schedule.end_date) return null;
    if (after === null || day > after) return day;
  }
  return null;
}

/** Today as a stored day (local noon). */
export function today(now: Date = new Date()): number {
  return toExpenseDay(now);
}

const UNIT: Record<Frequency, [string, string]> = {
  daily: ['day', 'Daily'],
  weekly: ['week', 'Weekly'],
  monthly: ['month', 'Monthly'],
  yearly: ['year', 'Yearly'],
};

/** "Monthly", "Every 2 weeks". */
export function describeFrequency(frequency: Frequency, interval: number): string {
  const [unit, label] = UNIT[frequency];
  return interval === 1 ? label : `Every ${interval} ${unit}s`;
}
