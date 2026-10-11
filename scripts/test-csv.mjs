// Tests for CSV export/import. Runs under plain Node (no device):
//   npm test            (runs this file under TZ=UTC, Asia/Kolkata, America/New_York)
// lib/csv.ts and lib/db/csv.ts are loaded through Node's TypeScript type
// stripping; the database side runs against node:sqlite with the schema built
// by the real migrations (lib/db/migrations.ts), as initDatabase() does.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

// The app's imports are extensionless ('../csv'); let Node find the .ts file.
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

const csv = await import('../lib/csv.ts');
const dbCsv = await import('../lib/db/csv.ts');
const { DEFAULT_CATEGORIES } = await import('../lib/types.ts');
const { runMigrations } = await import('../lib/db/migrations.ts');
const { parseExpenseDay, parseTimestamp } = await import('../lib/date.ts');
const { PRE_MIGRATION_SQL } = await import('./fixtures/pre-migration-db.mjs');
const PRE_MIGRATION_EXPORT = readFileSync(new URL('./fixtures/pre-migration-export.csv', import.meta.url), 'utf8');

/** A fresh install, as initDatabase() makes it: migrations, then the seeded default categories. */
function freshDb() {
  const db = adapt(new DatabaseSync(':memory:'));
  runMigrations(db);
  const now = Date.now();
  for (const c of DEFAULT_CATEGORIES) {
    db.runSync('INSERT INTO categories (name, color, icon, created_at) VALUES (?, ?, ?, ?)', [
      c.name, c.color ?? null, c.icon ?? null, now,
    ]);
  }
  return db;
}

/** An existing install from before the epoch migration, upgraded by it. */
function migratedPreMigrationDb() {
  const db = adapt(new DatabaseSync(':memory:'));
  db.raw.exec(PRE_MIGRATION_SQL);
  runMigrations(db);
  return db;
}

/** node:sqlite with the subset of expo-sqlite's sync API that lib/db/csv.ts uses. */
function adapt(raw) {
  const plain = (row) => (row ? { ...row } : row);
  return {
    raw,
    execSync: (sql) => raw.exec(sql),
    getAllSync: (sql, params) => raw.prepare(sql).all(...params).map(plain),
    getFirstSync: (sql, params) => plain(raw.prepare(sql).get(...params)) ?? null,
    runSync: (sql, params) => raw.prepare(sql).run(...params),
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

/** Adds an expense the way the app stores it; dates and timestamps are given as text. */
function addExpense(db, e) {
  const cat = db.getFirstSync('SELECT id FROM categories WHERE name = ?', [e.category]);
  db.runSync(
    `INSERT INTO expenses (amount, date, category_id, location, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.amount, parseExpenseDay(e.date), cat.id, e.location ?? null, e.description ?? null, e.metadata ?? null,
      parseTimestamp(e.created_at ?? '2025-01-01T10:00:00.000Z'),
      parseTimestamp(e.updated_at ?? '2025-01-01T10:00:00.000Z')]
  );
}

const expensesOf = (db) =>
  db.getAllSync(
    `SELECT e.id, e.amount, e.date, c.name as category, e.location, e.description, e.metadata, e.created_at, e.updated_at
     FROM expenses e JOIN categories c ON c.id = e.category_id ORDER BY e.id`,
    []
  );
const categoriesOf = (db) =>
  db.getAllSync('SELECT name, color, icon, is_active FROM categories ORDER BY name', []);

function importText(db, text) {
  const parsed = csv.parseImportCsv(text);
  assert.deepEqual(parsed.errors, []);
  const plan = dbCsv.planCsvImport(db, parsed);
  dbCsv.applyCsvImport(db, plan);
  return plan;
}

// ---------------------------------------------------------------------------
// Low-level CSV

test('serialize → parse round-trips awkward values', () => {
  const rows = [
    ['plain', 'with,comma', 'with "quotes"', 'multi\nline', 'crlf\r\nline'],
    ['₹ 100 — café 日本 🍕', '', ' padded ', '"', 'a""b'],
  ];
  assert.deepEqual(csv.parseCsv(csv.serializeCsv(rows)), rows);
});

test('parse handles BOM, CRLF, LF, CR, blank lines and no trailing newline', () => {
  assert.deepEqual(csv.parseCsv('﻿a,b\r\n1,2\n\n3,4\r5,6'), [
    ['a', 'b'], ['1', '2'], ['3', '4'], ['5', '6'],
  ]);
  assert.deepEqual(csv.parseCsv('a,b\r\n,\r\n""\r\n'), [['a', 'b'], ['', ''], ['']]);
  assert.deepEqual(csv.parseCsv(''), []);
});

test('parse rejects an unterminated quote', () => {
  assert.throws(() => csv.parseCsv('a,b\n"open,1\n'), /Unterminated/);
});

test('values', () => {
  assert.equal(csv.parseAmount('12.50'), 12.5);
  assert.equal(csv.parseAmount(' 0.3 '), 0.3);
  for (const bad of ['0', '-5', 'abc', '1,000', '1e3', '', 'NaN']) assert.equal(csv.parseAmount(bad), null, bad);
  assert.equal(csv.toIsoTimestamp('2025-03-04 05:06:07'), '2025-03-04T05:06:07.000Z');
  assert.equal(csv.toIsoTimestamp('2025-03-04T05:06:07.123Z'), '2025-03-04T05:06:07.123Z');
  assert.equal(csv.exportFileName(new Date(2026, 0, 5, 9, 7)), 'spendlog-export-20260105-0907.csv');
});

// ---------------------------------------------------------------------------
// Dates and timestamps. `npm test` runs the whole file under each of these
// timezones; expected values are [UTC, Asia/Kolkata, America/New_York].

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TZ_INDEX = { UTC: 0, 'Etc/UTC': 0, 'Asia/Kolkata': 1, 'Asia/Calcutta': 1, 'America/New_York': 2 }[TZ];
const byZone = (values) => (typeof values === 'string' ? values : values[TZ_INDEX]);

test(`date column → local calendar day (TZ=${TZ})`, { skip: TZ_INDEX === undefined && `unsupported TZ ${TZ}` }, () => {
  const cases = [
    ['2026-05-27', '2026-05-27'],
    ['2026/05/27', '2026-05-27'],
    [' 2026-05-27 ', '2026-05-27'],
    ['2026-05-27T23:30', '2026-05-27'], // no zone = local wall clock
    ['2026-05-27T00:15:00', '2026-05-27'],
    // IST near midnight: 20:00Z is 01:30 next day in India, 16:00 in New York.
    ['2026-05-26T20:00:00Z', ['2026-05-26', '2026-05-27', '2026-05-26']],
    ['2026-05-26T20:00:00.5z', ['2026-05-26', '2026-05-27', '2026-05-26']],
    ['2026-05-27T02:00:00+05:30', ['2026-05-26', '2026-05-27', '2026-05-26']],
    ['2026-05-27T02:00:00+0530', ['2026-05-26', '2026-05-27', '2026-05-26']],
    ['2026-05-27T03:00:00-04:00', '2026-05-27'],
    ['2026-05-27T01:00:00Z', ['2026-05-27', '2026-05-27', '2026-05-26']],
    ['2026-05-26 20:00:00', ['2026-05-26', '2026-05-27', '2026-05-26']], // SQLite = UTC
    ['2026-05-26 20:00:00+00:00', ['2026-05-26', '2026-05-27', '2026-05-26']],
    ['1779825600', ['2026-05-26', '2026-05-27', '2026-05-26']], // epoch s = 2026-05-26T20:00Z
    ['1779825600000', ['2026-05-26', '2026-05-27', '2026-05-26']], // epoch ms, same instant
    ['1779854400000', '2026-05-27'], // 2026-05-27T04:00Z
  ];
  for (const [input, expected] of cases) assert.equal(csv.parseDateValue(input), byZone(expected), input);
});

test(`timestamps → ISO UTC (TZ=${TZ})`, { skip: TZ_INDEX === undefined && `unsupported TZ ${TZ}` }, () => {
  const cases = [
    ['2026-05-26 20:00:00', '2026-05-26T20:00:00.000Z'],
    ['2025-03-04 05:06:07', '2025-03-04T05:06:07.000Z'],
    ['2026-05-27T09:57:00Z', '2026-05-27T09:57:00.000Z'],
    ['2026-05-27T09:57:00.123456Z', '2026-05-27T09:57:00.123Z'],
    ['2026-05-27T02:00:00+05:30', '2026-05-26T20:30:00.000Z'],
    ['1779825600', '2026-05-26T20:00:00.000Z'],
    ['1779825600123', '2026-05-26T20:00:00.123Z'],
    ['2026-05-27T09:57', ['2026-05-27T09:57:00.000Z', '2026-05-27T04:27:00.000Z', '2026-05-27T13:57:00.000Z']],
    ['2026-05-27', ['2026-05-27T00:00:00.000Z', '2026-05-26T18:30:00.000Z', '2026-05-27T04:00:00.000Z']],
  ];
  for (const [input, expected] of cases) assert.equal(csv.toIsoTimestamp(input), byZone(expected), input);
});

test('unparseable dates are rejected', () => {
  const bad = [
    '', 'yesterday', '05/03/2026', '27/05/2026', '5-3-26', '2026-02-30', '2026-13-01', '2026-5-27',
    '2026-05-27T24:00', '2026-05-27T10:60', '2026-05-27Z', '2026-05-27T10:00+15:00',
    '177982560', '17798256000', '177982560000', '-1779825600', '1779825600.5', '0999-01-01',
  ];
  for (const value of bad) {
    assert.equal(csv.parseDateValue(value), null, value);
    assert.equal(csv.toIsoTimestamp(value), null, value);
  }
});

test('date errors name the row, column, value and accepted formats', () => {
  const r = csv.parseImportCsv('date,amount,category,created_at\n2026-05-27,5,Food,\n05/03/2026,5,Food,\n2026-05-27,5,Food,soon\n');
  assert.deepEqual(r.errors.map((e) => e.row), [3, 4]);
  assert.match(r.errors[0].message, /^date "05\/03\/2026" is ambiguous.*YYYY-MM-DD.*epoch/);
  assert.match(r.errors[1].message, /^created_at "soon" is not a recognised date\. Use YYYY-MM-DD/);
  // Empty timestamps are fine: the database side defaults them to now.
  assert.equal(r.expenses.length, 1);
  assert.equal(r.expenses[0].created_at, null);
});

// ---------------------------------------------------------------------------
// Import validation

test('a hand-made sheet with other column order and headers imports', () => {
  const r = csv.parseImportCsv('Amount,Category Name,Date,Notes\r\n12.5,Food & Dining,2025-05-01,x\r\n');
  assert.deepEqual(r.errors, []);
  assert.equal(r.expenses.length, 1);
  assert.equal(r.expenses[0].category, 'Food & Dining');
  assert.equal(r.expenses[0].description, null);
});

test('every invalid row is reported', () => {
  const text = [
    'date,amount,category,category_color,record_type,id',
    '2025-02-30,10,Food,,,',
    '2025-02-01,-1,Food,,,',
    '2025-02-01,10,,,,',
    '2025-02-01,10,Food,red,,',
    '2025-02-01,10,Food,,bogus,',
    '2025-02-01,10,Food,,,1.5',
    '2025-02-01,10,Food,,,',
  ].join('\n');
  const r = csv.parseImportCsv(text);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 4, 5, 6, 7]);
  assert.equal(r.expenses.length, 1);
});

test('missing required columns block the file', () => {
  const r = csv.parseImportCsv('date,category\n2025-01-01,Food\n');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /amount/);
});

// ---------------------------------------------------------------------------
// Database round-trip

function sourceDb() {
  const db = freshDb();
  db.runSync("UPDATE categories SET color = '#123456', icon = 'pizza' WHERE name = 'Food & Dining'", []);
  db.runSync("INSERT INTO categories (name, color, icon, created_at) VALUES ('Pets 🐶', '#ABCDEF', 'dog', 1)", []);
  db.runSync("INSERT INTO categories (name, color, icon, is_active, created_at) VALUES ('Old, \"retired\"', NULL, NULL, 0, 1)", []);
  addExpense(db, { amount: 12.5, date: '2025-01-03', category: 'Food & Dining', location: 'Café "Zoë", MG Road', description: 'line one\nline two' });
  addExpense(db, { amount: 0.1 + 0.2, date: '2025-01-03', category: 'Food & Dining' });
  addExpense(db, { amount: 0.1 + 0.2, date: '2025-01-03', category: 'Food & Dining' }); // a genuine repeat
  addExpense(db, { amount: 1234567.89, date: '2024-12-31', category: 'Pets 🐶', metadata: '{"tags":["vet","a,b"]}', created_at: '2024-12-31T23:59:59.999Z', updated_at: '2025-01-02T00:00:00.000Z' });
  addExpense(db, { amount: 40, date: '2025-02-10', category: 'Shopping', description: '  spaced  ' });
  // Expenses in a category that was later deleted (soft delete).
  db.runSync("UPDATE categories SET is_active = 0 WHERE name = 'Shopping'", []);
  return db;
}

test('export → import into a fresh install reproduces the data', () => {
  const source = sourceDb();
  const exported = dbCsv.buildCsvExport(source);
  assert.equal(exported.expenseCount, 5);
  assert.equal(exported.categoryCount, 10);
  assert.ok(exported.csv.startsWith('﻿id,date,amount,category,'));

  const target = freshDb();
  const plan = importText(target, exported.csv);
  assert.equal(plan.expenses.length, 5);
  assert.equal(plan.duplicates, 0);
  assert.deepEqual(plan.newCategories.map((c) => c.name).sort(), ['Old, "retired"', 'Pets 🐶']);

  assert.deepEqual(expensesOf(target), expensesOf(source));
  assert.deepEqual(categoriesOf(target), categoriesOf(source));
  // And the restored database exports the same file.
  assert.equal(dbCsv.buildCsvExport(target).csv.split('\r\n').slice(0, 6).join('\n'),
    exported.csv.split('\r\n').slice(0, 6).join('\n'));
});

test('re-importing the same export adds nothing', () => {
  const source = sourceDb();
  const text = dbCsv.buildCsvExport(source).csv;
  const before = expensesOf(source);
  const plan = importText(source, text);
  assert.equal(plan.expenses.length, 0);
  assert.equal(plan.duplicates, 5);
  assert.deepEqual(plan.newCategories, []);
  assert.deepEqual(plan.categoryUpdates, []);
  assert.deepEqual(expensesOf(source), before);
});

test('merging into a database with data keeps existing rows and categories', () => {
  const source = sourceDb();
  const text = dbCsv.buildCsvExport(source).csv;

  const target = freshDb();
  target.runSync("UPDATE categories SET color = '#000000' WHERE name = 'Food & Dining'", []);
  addExpense(target, { amount: 99, date: '2025-03-01', category: 'Transportation', description: 'mine' });
  addExpense(target, { amount: 12.5, date: '2025-01-03', category: 'Food & Dining', description: 'line one\nline two' });
  const mine = expensesOf(target);

  const plan = importText(target, text);
  assert.equal(plan.duplicates, 1); // the 12.50 café row
  assert.equal(plan.expenses.length, 4);
  assert.deepEqual(plan.categoryUpdates, []);
  const after = expensesOf(target);
  assert.equal(after.length, 6);
  assert.deepEqual(after.slice(0, 2), mine);
  assert.equal(target.getFirstSync("SELECT color FROM categories WHERE name = 'Food & Dining'", []).color, '#000000');
  assert.equal(target.getFirstSync("SELECT is_active FROM categories WHERE name = 'Shopping'", []).is_active, 1);
});

test('categories match by name case-insensitively', () => {
  const db = freshDb();
  const plan = importText(db, 'date,amount,category,category_color\n2025-01-01,5,FOOD & dining,#FFFFFF\n2025-01-02,6,new cat,#00FF00\n2025-01-03,7,New Cat,\n');
  assert.deepEqual(plan.newCategories.map((c) => [c.name, c.color]), [['new cat', '#00FF00']]);
  assert.deepEqual(expensesOf(db).map((e) => e.category), ['Food & Dining', 'new cat', 'new cat']);
});

test('lenient dates and timestamps import as the current schema stores them', () => {
  const db = freshDb();
  const before = Date.now();
  importText(db, [
    'date,amount,category,created_at,updated_at',
    '1779825600000,10,Food & Dining,2026-05-26 20:00:00,',
    '2026-05-27T02:00:00+05:30,11,Food & Dining,1779825600,2026-05-27T09:57',
    '2026/05/27,12,Food & Dining,,',
  ].join('\n'));
  const rows = expensesOf(db);
  // Dates are local noon of the calendar day, timestamps epoch ms.
  const noon = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  };
  const day = noon(byZone(['2026-05-26', '2026-05-27', '2026-05-26']));
  assert.deepEqual(rows.map((r) => r.date), [day, day, noon('2026-05-27')]);
  assert.equal(rows[0].created_at, Date.UTC(2026, 4, 26, 20));
  assert.equal(rows[1].created_at, Date.UTC(2026, 4, 26, 20));
  assert.equal(rows[1].updated_at, new Date(2026, 4, 27, 9, 57).getTime());
  for (const value of [rows[0].updated_at, rows[2].created_at, rows[2].updated_at]) {
    assert.equal(typeof value, 'number');
    assert.ok(value >= before - 1000 && value <= Date.now(), `${value} defaults to now`);
  }
});

test('a failure part-way through rolls the whole import back', () => {
  const db = freshDb();
  const parsed = csv.parseImportCsv('date,amount,category\n2025-01-01,5,Brand New\n2025-01-02,6,Brand New\n');
  const plan = dbCsv.planCsvImport(db, parsed);
  plan.expenses.push({ ...plan.expenses[0], row: 99, category: 'Not planned' });
  assert.throws(() => dbCsv.applyCsvImport(db, plan), /Row 99/);
  assert.equal(expensesOf(db).length, 0);
  assert.equal(db.getFirstSync("SELECT COUNT(*) as n FROM categories WHERE name = 'Brand New'", []).n, 0);
});

// ---------------------------------------------------------------------------
// Epoch storage: imported rows must be stored exactly like migrated rows.

const rawExpenses = (db) =>
  db.getAllSync(
    `SELECT e.id, e.amount, e.date, e.location, e.description, e.metadata, e.created_at, e.updated_at,
            c.name AS category
     FROM expenses e JOIN categories c ON c.id = e.category_id ORDER BY e.id`,
    []
  );
// Seeded default categories get created_at = install time in a fresh install
// and import doesn't change it, so created_at is compared for the others only.
const DEFAULT_NAMES = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
const rawCategories = (db) =>
  db
    .getAllSync('SELECT name, color, icon, is_active, created_at FROM categories ORDER BY name', [])
    .map((c) => (DEFAULT_NAMES.has(c.name) ? { ...c, created_at: 'install time' } : c));

test(`pre-migration export imported into a migrated DB = migrating that data (TZ=${TZ})`, () => {
  const migrated = migratedPreMigrationDb();
  const imported = freshDb();
  const plan = importText(imported, PRE_MIGRATION_EXPORT);
  assert.equal(plan.expenses.length, 9);

  const expected = rawExpenses(migrated);
  assert.equal(expected.length, 9);
  assert.deepEqual(rawExpenses(imported), expected);
  assert.deepEqual(rawCategories(imported), rawCategories(migrated));

  // Not trivially equal: the values really are epoch ms.
  const shifted = expected.find((e) => e.description === 'shifted');
  assert.equal(shifted.date, new Date(2025, 2, 15, 12).getTime());
  assert.equal(shifted.created_at, Date.UTC(2025, 2, 15, 18, 50));
  assert.equal(expected.find((e) => e.description === 'sqlite-default').created_at, Date.UTC(2025, 0, 1, 4, 5, 6));
  assert.equal(
    migrated.getFirstSync("SELECT created_at FROM categories WHERE name = 'Pets 🐶'", []).created_at,
    Date.UTC(2025, 1, 1, 18, 45, 12)
  );
});

test(`export → import of a migrated DB reproduces identical epoch values (TZ=${TZ})`, () => {
  const source = migratedPreMigrationDb();
  // Plus rows written by the new app, including a non-whole-second timestamp.
  addExpense(source, {
    amount: 42, date: '2026-05-27', category: 'Pets 🐶', description: 'new app',
    created_at: '2026-05-26T18:45:01.234Z', updated_at: '2026-05-26T18:45:01.234Z',
  });
  const exported = dbCsv.buildCsvExport(source);
  // Export stays human-readable: local calendar days and ISO UTC timestamps.
  assert.match(exported.csv, /\r\n2,2025-03-15,120,Food & Dining,.*,2025-03-15T18:50:00\.000Z,2025-03-15T18:50:00\.000Z,expense,\r\n/);

  const target = freshDb();
  importText(target, exported.csv);
  assert.deepEqual(rawExpenses(target), rawExpenses(source));
  assert.deepEqual(rawCategories(target), rawCategories(source));
  // Re-exporting gives the same expense lines (category lines differ only in
  // the seeded defaults' created_at, see rawCategories).
  const expenseLines = (text) => text.split('\r\n').filter((line) => line.endsWith(',expense,'));
  assert.equal(expenseLines(exported.csv).length, 10);
  assert.deepEqual(expenseLines(dbCsv.buildCsvExport(target).csv), expenseLines(exported.csv));
});
