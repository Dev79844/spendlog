// Tests for the Insights aggregates (lib/db/insights.ts). Runs under plain Node:
//   npm test            (runs this file under TZ=UTC, Asia/Kolkata, America/New_York)
// The database is node:sqlite with the schema built by the real migrations.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

// The app's imports are extensionless ('../date'); let Node find the .ts file.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const insights = await import('../lib/db/insights.ts');
const { runMigrations } = await import('../lib/db/migrations.ts');
const { toExpenseDay } = await import('../lib/date.ts');

/** node:sqlite with the subset of expo-sqlite's sync API the code uses. */
function adapt(raw) {
  const plain = (row) => (row ? { ...row } : row);
  return {
    execSync: (sql) => raw.exec(sql),
    getAllSync: (sql, params) => raw.prepare(sql).all(...params).map(plain),
    getFirstSync: (sql, params) => plain(raw.prepare(sql).get(...params)) ?? null,
    runSync: (sql, params) => raw.prepare(sql).run(...params),
  };
}

const CATEGORIES = [
  { name: 'Food', color: '#FF0000', icon: 'food' },
  { name: 'Travel', color: '#00FF00', icon: 'car' },
  { name: 'Old', color: '#0000FF', icon: 'tag', is_active: 0 },
];

function freshDb() {
  const db = adapt(new DatabaseSync(':memory:'));
  runMigrations(db);
  for (const c of CATEGORIES) {
    db.runSync('INSERT INTO categories (name, color, icon, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [
      c.name, c.color, c.icon, c.is_active ?? 1, 0,
    ]);
  }
  return db;
}

/** Local calendar day, as the app stores it (local noon). */
const day = (y, m, d) => toExpenseDay(new Date(y, m - 1, d));

function add(db, category, amount, date, description = null) {
  const cat = db.getFirstSync('SELECT id FROM categories WHERE name = ?', [category]);
  db.runSync(
    'INSERT INTO expenses (amount, date, category_id, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [amount, date, cat.id, description, 0, 0]
  );
}

/** A database with expenses spread over Dec 2025 – Mar 2026. */
function sampleDb() {
  const db = freshDb();
  add(db, 'Food', 50, day(2025, 12, 31), 'new year eve');
  add(db, 'Food', 100, day(2026, 1, 1));
  add(db, 'Travel', 300, day(2026, 1, 15), 'train');
  add(db, 'Food', 20, day(2026, 2, 1));
  add(db, 'Food', 30, day(2026, 2, 1));
  add(db, 'Travel', 150, day(2026, 2, 14), 'taxi');
  add(db, 'Old', 50, day(2026, 2, 28), 'deleted category');
  add(db, 'Food', 10, day(2026, 3, 1));
  return db;
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('month insights: totals, change and local month boundaries', () => {
  const db = sampleDb();
  const feb = insights.getMonthInsights(db, '2026-02', new Date(2026, 5, 1).getTime());
  assert.equal(feb.expenses, 250);
  assert.equal(feb.expenseCount, 4);
  assert.equal(feb.previousMonth, '2026-01');
  assert.equal(feb.previousExpenses, 400);
  assert.equal(feb.change, -150);
  close(feb.changePercent, -37.5);
  assert.equal(feb.daysCounted, 28);
  close(feb.dailyAverage, 250 / 28);
});

test('month insights: no change percent when the previous month is empty', () => {
  const db = sampleDb();
  const dec = insights.getMonthInsights(db, '2025-12', new Date(2026, 5, 1).getTime());
  assert.equal(dec.expenses, 50);
  assert.equal(dec.previousExpenses, 0);
  assert.equal(dec.change, 50);
  assert.equal(dec.changePercent, null);
});

test('month insights: daily average counts days up to today in the current month', () => {
  const db = sampleDb();
  const midFeb = new Date(2026, 1, 10, 23, 59).getTime();
  assert.equal(insights.getMonthInsights(db, '2026-02', midFeb).daysCounted, 10);
  const firstMinute = new Date(2026, 1, 1, 0, 0).getTime();
  assert.equal(insights.getMonthInsights(db, '2026-02', firstMinute).daysCounted, 1);
  const future = insights.getMonthInsights(db, '2026-04', midFeb);
  assert.equal(future.daysCounted, 0);
  assert.equal(future.dailyAverage, 0);
});

test('category breakdown: largest first, includes soft-deleted categories, percentages sum to 100', () => {
  const db = sampleDb();
  const { categories } = insights.getMonthInsights(db, '2026-02');
  assert.deepEqual(
    categories.map((c) => [c.category_name, c.total, c.count]),
    [['Travel', 150, 1], ['Food', 50, 2], ['Old', 50, 1]]
  );
  close(categories[0].percentage, 60);
  close(categories.reduce((s, c) => s + c.percentage, 0), 100);
  assert.equal(categories[0].category_color, '#00FF00');
  assert.equal(categories[0].category_icon, 'car');
});

test('daily totals: one entry per local day, including leap days', () => {
  const db = sampleDb();
  const feb = insights.getDailyTotals(db, '2026-02');
  assert.equal(feb.length, 28);
  assert.deepEqual(feb[0], { day: 1, expenses: 50 });
  assert.equal(feb[13].expenses, 150);
  assert.equal(feb[27].expenses, 50);
  assert.equal(feb.reduce((s, d) => s + d.expenses, 0), 250);
  assert.equal(insights.getDailyTotals(db, '2028-02').length, 29);
});

test('daily totals: a value off local noon still lands on its local day', () => {
  const db = freshDb();
  // Rows written before the noon convention may hold local midnight or late evening.
  add(db, 'Food', 7, new Date(2026, 2, 5, 0, 0).getTime());
  add(db, 'Food', 9, new Date(2026, 2, 5, 23, 59).getTime());
  add(db, 'Food', 11, new Date(2026, 2, 31, 23, 59).getTime());
  const daily = insights.getDailyTotals(db, '2026-03');
  assert.equal(daily[4].expenses, 16);
  assert.equal(daily[30].expenses, 11);
  assert.equal(insights.getMonthInsights(db, '2026-04').expenses, 0);
});

test('largest expenses: by amount, limited, with category', () => {
  const db = sampleDb();
  const largest = insights.getMonthInsights(db, '2026-02').largest;
  assert.deepEqual(
    largest.map((e) => [e.amount, e.category_name, e.description]),
    [[150, 'Travel', 'taxi'], [50, 'Old', 'deleted category'], [30, 'Food', null], [20, 'Food', null]]
  );
  const { start, end } = { start: day(2025, 1, 1), end: day(2027, 1, 1) };
  assert.equal(insights.getLargestExpenses(db, start, end, 2).length, 2);
});

test('empty month: zeros and empty lists', () => {
  const db = freshDb();
  const m = insights.getMonthInsights(db, '2026-02', new Date(2026, 5, 1).getTime());
  assert.equal(m.expenses, 0);
  assert.equal(m.expenseCount, 0);
  assert.equal(m.changePercent, null);
  assert.equal(m.dailyAverage, 0);
  assert.deepEqual(m.categories, []);
  assert.deepEqual(m.largest, []);
  assert.equal(m.daily.length, 28);
  assert.ok(m.daily.every((d) => d.expenses === 0));
});

test('spending trend: months across a year boundary, empty months as zero', () => {
  const db = sampleDb();
  const trend = insights.getSpendingTrend(db, '2026-04', 6);
  assert.deepEqual(trend.months, ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']);
  assert.deepEqual(
    trend.totals.map((t) => [t.month, t.expenses]),
    [['2025-11', 0], ['2025-12', 50], ['2026-01', 400], ['2026-02', 250], ['2026-03', 10], ['2026-04', 0]]
  );
  assert.deepEqual(
    trend.categories.map((c) => [c.category_name, c.total, c.monthly]),
    [
      ['Travel', 450, [0, 0, 300, 150, 0, 0]],
      ['Food', 210, [0, 50, 100, 50, 10, 0]],
      ['Old', 50, [0, 0, 0, 50, 0, 0]],
    ]
  );
});

test('spending trend: twelve months, empty database', () => {
  const trend = insights.getSpendingTrend(freshDb(), '2026-03', 12);
  assert.equal(trend.months.length, 12);
  assert.equal(trend.months[0], '2025-04');
  assert.ok(trend.totals.every((t) => t.expenses === 0));
  assert.deepEqual(trend.categories, []);
});
