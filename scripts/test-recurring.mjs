// Tests for recurring rules: the schedule maths (lib/recurrence.ts) and the
// catch-up that generates rows (lib/db/recurring.ts). Runs under plain Node:
//   npm test            (runs this file under TZ=UTC, Asia/Kolkata, America/New_York)
// The database is node:sqlite with the schema built by the real migrations.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

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

const { occurrenceDate, occurrencesBetween, nextOccurrence, describeFrequency } = await import('../lib/recurrence.ts');
const rec = await import('../lib/db/recurring.ts');
const { runMigrations } = await import('../lib/db/migrations.ts');
const { toDayKey } = await import('../lib/date.ts');

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const noon = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
// A moment on a local day, at an hour other than noon (the catch-up must not care).
const at = (day, hour = 8) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 30);
};
const days = (list) => list.map(toDayKey);
const schedule = (frequency, start, extra = {}) => ({
  frequency, interval: 1, start_date: noon(start), end_date: null, ...extra,
});

function adapt(raw) {
  const plain = (row) => (row ? { ...row } : row);
  return {
    raw,
    execSync: (sql) => raw.exec(sql),
    getAllSync: (sql, params = []) => raw.prepare(sql).all(...params).map(plain),
    getFirstSync: (sql, params = []) => plain(raw.prepare(sql).get(...params)) ?? null,
    runSync: (sql, params = []) => raw.prepare(sql).run(...params),
    withTransactionSync(task) {
      raw.exec('BEGIN');
      try {
        task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function freshDb() {
  const db = adapt(new DatabaseSync(':memory:'));
  runMigrations(db);
  db.runSync("INSERT INTO categories (name, created_at) VALUES ('Bills & Utilities', 1)");
  return db;
}

const categoryId = (db, kind, name) =>
  db.getFirstSync(`SELECT id FROM ${kind === 'income' ? 'income_categories' : 'categories'} WHERE name = ?`, [name]).id;

function addRule(db, overrides = {}) {
  const kind = overrides.kind ?? 'expense';
  return rec.createRecurringRule(db, {
    kind,
    amount: 1000,
    category_id: categoryId(db, kind, kind === 'income' ? 'Salary' : 'Bills & Utilities'),
    location: null,
    description: 'Rent',
    frequency: 'monthly',
    interval: 1,
    start_date: noon('2025-01-31'),
    end_date: null,
    ...overrides,
  });
}

const rowsOf = (db, table = 'expenses') =>
  db.getAllSync(`SELECT * FROM ${table} ORDER BY date, id`);

// ---------------------------------------------------------------------------
// Schedules

test(`monthly from the 31st clamps to the month end without drifting (TZ=${TZ})`, () => {
  const s = schedule('monthly', '2025-01-31');
  assert.deepEqual(
    days([0, 1, 2, 3, 4, 12, 13].map((n) => occurrenceDate(s, n))),
    ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31', '2026-01-31', '2026-02-28']
  );
  assert.equal(toDayKey(occurrenceDate(schedule('monthly', '2024-01-30'), 1)), '2024-02-29');
  assert.deepEqual(
    days([0, 1, 2].map((n) => occurrenceDate(schedule('monthly', '2025-11-30', { interval: 3 }), n))),
    ['2025-11-30', '2026-02-28', '2026-05-30']
  );
});

test('yearly on 29 Feb falls on 28 Feb in common years', () => {
  const s = schedule('yearly', '2024-02-29');
  assert.deepEqual(days([0, 1, 2, 3, 4].map((n) => occurrenceDate(s, n))), [
    '2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29',
  ]);
});

test(`daily and weekly stay at local noon across DST changes (TZ=${TZ})`, () => {
  // US DST: 9 Mar and 2 Nov 2025.
  const weekly = occurrencesBetween(schedule('weekly', '2025-03-02'), null, noon('2025-11-16'));
  assert.equal(weekly.length, 38);
  for (const day of weekly) assert.equal(new Date(day).getHours(), 12);
  assert.deepEqual(days(weekly.slice(0, 3)), ['2025-03-02', '2025-03-09', '2025-03-16']);
  assert.equal(toDayKey(weekly.at(-1)), '2025-11-16');

  const daily = occurrencesBetween(schedule('daily', '2025-03-08', { interval: 2 }), null, noon('2025-03-14'));
  assert.deepEqual(days(daily), ['2025-03-08', '2025-03-10', '2025-03-12', '2025-03-14']);
  for (const day of daily) assert.equal(new Date(day).getHours(), 12);
});

test('range: after is exclusive, until and end date are inclusive', () => {
  const s = schedule('monthly', '2025-01-15', { end_date: noon('2025-04-15') });
  assert.deepEqual(days(occurrencesBetween(s, null, noon('2025-12-31'))), [
    '2025-01-15', '2025-02-15', '2025-03-15', '2025-04-15',
  ]);
  assert.deepEqual(days(occurrencesBetween(s, noon('2025-02-15'), noon('2025-03-15'))), ['2025-03-15']);
  assert.deepEqual(occurrencesBetween(s, null, noon('2025-01-14')), []);
  assert.equal(toDayKey(nextOccurrence(s, noon('2025-03-15'))), '2025-04-15');
  assert.equal(nextOccurrence(s, noon('2025-04-15')), null);
  assert.equal(describeFrequency('monthly', 1), 'Monthly');
  assert.equal(describeFrequency('weekly', 2), 'Every 2 weeks');
});

// ---------------------------------------------------------------------------
// Catch-up

test('catch-up generates every missed occurrence across months, as normal linked rows', () => {
  const db = freshDb();
  const rule = addRule(db);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-15')), 4);
  const rows = rowsOf(db);
  assert.deepEqual(days(rows.map((r) => r.date)), ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  for (const r of rows) {
    assert.equal(r.amount, 1000);
    assert.equal(r.description, 'Rent');
    assert.equal(r.recurring_rule_id, rule.id);
    assert.equal(r.occurrence_date, r.date);
    assert.equal(new Date(r.date).getHours(), 12);
  }
  assert.equal(toDayKey(rec.getRecurringRuleById(db, rule.id).last_occurrence), '2025-04-30');

  // Later the same day: nothing new. Next month: just the new occurrence.
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-15', 23)), 0);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-31', 0)), 1);
  assert.equal(toDayKey(rowsOf(db).at(-1).date), '2025-05-31');
});

test('an occurrence today is generated whatever the time of day', () => {
  const db = freshDb();
  addRule(db, { start_date: noon('2025-06-10'), frequency: 'daily' });
  assert.equal(rec.materializeDueOccurrences(db, at('2025-06-10', 0)), 1);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-06-10', 23)), 0);
});

test('idempotent: a lost cursor (crash after insert) does not double anything', () => {
  const db = freshDb();
  const rule = addRule(db);
  rec.materializeDueOccurrences(db, at('2025-05-15'));
  const before = rowsOf(db);
  db.runSync('UPDATE recurring_rules SET last_occurrence = NULL WHERE id = ?', [rule.id]);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-15')), 0);
  assert.deepEqual(rowsOf(db), before);
  assert.equal(toDayKey(rec.getRecurringRuleById(db, rule.id).last_occurrence), '2025-04-30');
});

test('a failure rolls back that rule\'s rows and cursor together', () => {
  const db = freshDb();
  const rule = addRule(db);
  db.raw.exec(`CREATE TRIGGER boom BEFORE INSERT ON expenses WHEN NEW.date > ${noon('2025-03-01')}
               BEGIN SELECT RAISE(ABORT, 'boom'); END`);
  assert.throws(() => rec.materializeDueOccurrences(db, at('2025-05-15')), /boom/);
  assert.equal(rowsOf(db).length, 0);
  assert.equal(rec.getRecurringRuleById(db, rule.id).last_occurrence, null);
  db.raw.exec('DROP TRIGGER boom');
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-15')), 4);
});

test('a deleted generated row is not recreated', () => {
  const db = freshDb();
  addRule(db);
  rec.materializeDueOccurrences(db, at('2025-03-01'));
  db.runSync('DELETE FROM expenses WHERE date = ?', [noon('2025-01-31')]);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-03-01')), 0);
  assert.deepEqual(days(rowsOf(db).map((r) => r.date)), ['2025-02-28']);
});

test('income rules write to incomes; the end date stops a rule', () => {
  const db = freshDb();
  addRule(db, {
    kind: 'income', amount: 5000, description: 'Salary', start_date: noon('2025-01-01'),
    end_date: noon('2025-03-01'), location: 'ignored for income',
  });
  assert.equal(rec.materializeDueOccurrences(db, at('2025-12-01')), 3);
  assert.equal(rowsOf(db).length, 0);
  const incomes = rowsOf(db, 'incomes');
  assert.deepEqual(days(incomes.map((r) => r.date)), ['2025-01-01', '2025-02-01', '2025-03-01']);
  assert.equal(incomes[0].category_id, categoryId(db, 'income', 'Salary'));
  assert.equal(rec.getRecurringRules(db)[0].location, null);
  assert.equal(rec.getRecurringRules(db)[0].category_name, 'Salary');
});

test('paused rules generate nothing; resuming skips the paused period', () => {
  const db = freshDb();
  const rule = addRule(db, { start_date: noon('2025-01-01') });
  rec.materializeDueOccurrences(db, at('2025-01-10'));
  rec.setRecurringRuleActive(db, rule.id, false);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-04-10')), 0);
  rec.setRecurringRuleActive(db, rule.id, true, at('2025-04-01'));
  assert.equal(rec.materializeDueOccurrences(db, at('2025-05-10')), 2);
  assert.deepEqual(days(rowsOf(db).map((r) => r.date)), ['2025-01-01', '2025-04-01', '2025-05-01']);
});

test('editing a rule only changes occurrences after the last generated one', () => {
  const db = freshDb();
  const rule = addRule(db, { start_date: noon('2025-01-01') });
  rec.materializeDueOccurrences(db, at('2025-02-10'));
  rec.updateRecurringRule(db, rule.id, {
    ...rec.getRecurringRuleById(db, rule.id), amount: 1200, frequency: 'monthly', start_date: noon('2025-01-15'),
  });
  rec.materializeDueOccurrences(db, at('2025-03-20'));
  assert.deepEqual(rowsOf(db).map((r) => [toDayKey(r.date), r.amount]), [
    ['2025-01-01', 1000], ['2025-02-01', 1000], ['2025-02-15', 1200], ['2025-03-15', 1200],
  ]);
});

test('deleting a rule keeps its rows, unlinked', () => {
  const db = freshDb();
  const rule = addRule(db);
  addRule(db, { kind: 'income', start_date: noon('2025-01-01') });
  rec.materializeDueOccurrences(db, at('2025-03-01'));
  rec.deleteRecurringRule(db, rule.id);
  assert.equal(rec.getRecurringRuleById(db, rule.id), null);
  const rows = rowsOf(db);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.recurring_rule_id, null);
    assert.equal(r.occurrence_date, null);
  }
  assert.equal(rowsOf(db, 'incomes').filter((r) => r.recurring_rule_id !== null).length, 3);
  assert.equal(rec.materializeDueOccurrences(db, at('2025-06-01')), 3); // only the income rule remains
});
