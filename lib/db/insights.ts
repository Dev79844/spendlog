// Aggregates for the Insights tab, computed with SQL over the stored epoch-ms
// dates. Month and day boundaries are local time, built in JS with lib/date.ts
// and passed to SQLite as [start, end) ranges, so nothing depends on SQLite's
// own idea of the timezone and no expense rows are loaded into JS just to sum
// them.
//
// Like lib/db/csv.ts, these take the database as a parameter (screens pass
// `db` from './index') so scripts/test-insights.mjs can run them under Node
// against node:sqlite. Only pure modules may be imported here.
//
// Series are named by what they sum (`expenses`). When income exists, add an
// `income` sum next to it in the same queries (and `net = income - expenses`)
// rather than adding a parallel module.

import { getMonthDayRanges, getMonthRange, shiftMonth } from '../date';

type BindValue = string | number | null;

export interface InsightsDatabase {
  getAllSync<T>(source: string, params: BindValue[]): T[];
  getFirstSync<T>(source: string, params: BindValue[]): T | null;
}

export interface CategoryBreakdown {
  category_id: number;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  total: number;
  count: number;
  /** Share of the period's total, 0–100, unrounded. */
  percentage: number;
}

export interface DayTotal {
  /** Day of the month, 1-based. */
  day: number;
  expenses: number;
}

export interface LargestExpense {
  id: number;
  amount: number;
  date: number;
  description: string | null;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
}

export interface MonthInsights {
  month: string;
  expenses: number;
  expenseCount: number;
  previousMonth: string;
  previousExpenses: number;
  /** expenses - previousExpenses. */
  change: number;
  /** Change as a percentage of the previous month; null when that was 0. */
  changePercent: number | null;
  /** Days counted for the daily average: all of a past month, up to today for the current one. */
  daysCounted: number;
  dailyAverage: number;
  categories: CategoryBreakdown[];
  daily: DayTotal[];
  largest: LargestExpense[];
}

export interface MonthTotal {
  month: string;
  expenses: number;
}

export interface CategoryTrend {
  category_id: number;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  /** Sum over all the months of the trend. */
  total: number;
  /** One entry per month, oldest first, aligned with the trend's `months`. */
  monthly: number[];
}

export interface SpendingTrend {
  /** Month keys, oldest first. */
  months: string[];
  totals: MonthTotal[];
  categories: CategoryTrend[];
}

const UNCATEGORIZED = 'Uncategorized';

// A `WITH` table of labelled [start, end) ranges, and its bind values.
function rangesCte(name: string, ranges: { key: BindValue; start: number; end: number }[]) {
  const rows = ranges.map(() => '(?, ?, ?)').join(', ');
  return {
    sql: `${name}(label, lo, hi) AS (VALUES ${rows})`,
    params: ranges.flatMap((r) => [r.key, r.start, r.end]),
  };
}

function sumBetween(db: InsightsDatabase, start: number, end: number) {
  const row = db.getFirstSync<{ total: number | null; count: number }>(
    'SELECT SUM(amount) AS total, COUNT(*) AS count FROM expenses WHERE date >= ? AND date < ?',
    [start, end]
  );
  return { total: row?.total ?? 0, count: row?.count ?? 0 };
}

/** Spending per category in [start, end), largest first. Soft-deleted categories still count. */
export function getCategoryBreakdown(
  db: InsightsDatabase,
  start: number,
  end: number
): CategoryBreakdown[] {
  const rows = db.getAllSync<Omit<CategoryBreakdown, 'percentage'>>(
    `SELECT
       e.category_id AS category_id,
       COALESCE(c.name, ?) AS category_name,
       c.color AS category_color,
       c.icon AS category_icon,
       SUM(e.amount) AS total,
       COUNT(*) AS count
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.date >= ? AND e.date < ?
     GROUP BY e.category_id
     ORDER BY total DESC, category_name`,
    [UNCATEGORIZED, start, end]
  );
  const sum = rows.reduce((acc, r) => acc + r.total, 0);
  return rows.map((r) => ({ ...r, percentage: sum > 0 ? (r.total * 100) / sum : 0 }));
}

/** Spending per day of `month` (local days), one entry for every day. */
export function getDailyTotals(db: InsightsDatabase, month: string): DayTotal[] {
  const days = getMonthDayRanges(month).map((r, i) => ({ key: i + 1, ...r }));
  const cte = rangesCte('days', days);
  return db.getAllSync<DayTotal>(
    `WITH ${cte.sql}
     SELECT d.label AS day, COALESCE(SUM(e.amount), 0) AS expenses
     FROM days d
     LEFT JOIN expenses e ON e.date >= d.lo AND e.date < d.hi
     GROUP BY d.label
     ORDER BY d.label`,
    cte.params
  );
}

/** The `limit` largest expenses in [start, end). */
export function getLargestExpenses(
  db: InsightsDatabase,
  start: number,
  end: number,
  limit = 5
): LargestExpense[] {
  return db.getAllSync<LargestExpense>(
    `SELECT
       e.id, e.amount, e.date, e.description,
       COALESCE(c.name, ?) AS category_name,
       c.color AS category_color,
       c.icon AS category_icon
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.date >= ? AND e.date < ?
     ORDER BY e.amount DESC, e.date DESC, e.id DESC
     LIMIT ?`,
    [UNCATEGORIZED, start, end, limit]
  );
}

// Days of `month` that count towards its daily average at time `now`.
function daysCounted(month: string, now: number): number {
  const days = getMonthDayRanges(month);
  const { start, end } = getMonthRange(month);
  if (now >= end) return days.length;
  if (now < start) return 0;
  return days.findIndex((d) => now < d.end) + 1;
}

/** Everything the monthly view shows for `month` ('YYYY-MM', local). */
export function getMonthInsights(
  db: InsightsDatabase,
  month: string,
  now: number = Date.now()
): MonthInsights {
  const { start, end } = getMonthRange(month);
  const previousMonth = shiftMonth(month, -1);
  const prev = getMonthRange(previousMonth);

  const current = sumBetween(db, start, end);
  const previousExpenses = sumBetween(db, prev.start, prev.end).total;
  const change = current.total - previousExpenses;
  const counted = daysCounted(month, now);

  return {
    month,
    expenses: current.total,
    expenseCount: current.count,
    previousMonth,
    previousExpenses,
    change,
    changePercent: previousExpenses > 0 ? (change * 100) / previousExpenses : null,
    daysCounted: counted,
    dailyAverage: counted > 0 ? current.total / counted : 0,
    categories: getCategoryBreakdown(db, start, end),
    daily: getDailyTotals(db, month),
    largest: getLargestExpenses(db, start, end),
  };
}

/** Months covered by the trend view. */
export const TREND_MONTHS = 12;

/** Totals for the TREND_MONTHS months ending with `lastMonth`, oldest first, with per-category series. */
export function getSpendingTrend(db: InsightsDatabase, lastMonth: string): SpendingTrend {
  const months = Array.from({ length: TREND_MONTHS }, (_, i) =>
    shiftMonth(lastMonth, i - TREND_MONTHS + 1)
  );
  const cte = rangesCte(
    'months',
    months.map((m) => ({ key: m, ...getMonthRange(m) }))
  );

  const totals = db.getAllSync<MonthTotal>(
    `WITH ${cte.sql}
     SELECT m.label AS month, COALESCE(SUM(e.amount), 0) AS expenses
     FROM months m
     LEFT JOIN expenses e ON e.date >= m.lo AND e.date < m.hi
     GROUP BY m.label
     ORDER BY m.lo`,
    cte.params
  );

  const rows = db.getAllSync<{
    month: string;
    category_id: number;
    category_name: string;
    category_color: string | null;
    category_icon: string | null;
    total: number;
  }>(
    `WITH ${cte.sql}
     SELECT
       m.label AS month,
       e.category_id AS category_id,
       COALESCE(c.name, ?) AS category_name,
       c.color AS category_color,
       c.icon AS category_icon,
       SUM(e.amount) AS total
     FROM months m
     JOIN expenses e ON e.date >= m.lo AND e.date < m.hi
     LEFT JOIN categories c ON c.id = e.category_id
     GROUP BY m.label, e.category_id`,
    [...cte.params, UNCATEGORIZED]
  );

  const index = new Map(months.map((m, i) => [m, i]));
  const byCategory = new Map<number, CategoryTrend>();
  for (const r of rows) {
    let trend = byCategory.get(r.category_id);
    if (!trend) {
      trend = {
        category_id: r.category_id,
        category_name: r.category_name,
        category_color: r.category_color,
        category_icon: r.category_icon,
        total: 0,
        monthly: months.map(() => 0),
      };
      byCategory.set(r.category_id, trend);
    }
    trend.monthly[index.get(r.month)!] = r.total;
    trend.total += r.total;
  }

  const categories = [...byCategory.values()].sort(
    (a, b) => b.total - a.total || a.category_name.localeCompare(b.category_name)
  );
  return { months, totals, categories };
}
