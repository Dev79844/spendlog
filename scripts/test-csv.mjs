// Tests for CSV export/import. Runs under plain Node (no device):
//   npm test
// lib/csv.ts and lib/db/csv.ts are loaded through Node's TypeScript type
// stripping; the database side runs against node:sqlite with the same schema
// as lib/db/index.ts.

import assert from 'node:assert/strict';
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

// Mirrors initDatabase() in lib/db/index.ts.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    location TEXT,
    description TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
`;

/** A fresh install: schema plus the seeded default categories. */
function freshDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(SCHEMA_SQL);
  for (const c of DEFAULT_CATEGORIES) {
    raw.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)').run(c.name, c.color ?? null, c.icon ?? null);
  }
  return adapt(raw);
}

/** node:sqlite with the subset of expo-sqlite's sync API that lib/db/csv.ts uses. */
function adapt(raw) {
  const plain = (row) => (row ? { ...row } : row);
  return {
    raw,
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

function addExpense(db, e) {
  const cat = db.getFirstSync('SELECT id FROM categories WHERE name = ?', [e.category]);
  db.runSync(
    `INSERT INTO expenses (amount, date, category_id, location, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.amount, e.date, cat.id, e.location ?? null, e.description ?? null, e.metadata ?? null,
      e.created_at ?? '2025-01-01T10:00:00.000Z', e.updated_at ?? '2025-01-01T10:00:00.000Z']
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
  assert.equal(csv.isValidDate('2024-02-29'), true);
  assert.equal(csv.isValidDate('2025-02-29'), false);
  assert.equal(csv.isValidDate('2025-1-05'), false);
  assert.equal(csv.parseAmount('12.50'), 12.5);
  assert.equal(csv.parseAmount(' 0.3 '), 0.3);
  for (const bad of ['0', '-5', 'abc', '1,000', '1e3', '', 'NaN']) assert.equal(csv.parseAmount(bad), null, bad);
  assert.equal(csv.toIsoTimestamp('2025-03-04 05:06:07'), '2025-03-04T05:06:07.000Z');
  assert.equal(csv.toIsoTimestamp('2025-03-04T05:06:07.123Z'), '2025-03-04T05:06:07.123Z');
  assert.equal(csv.toIsoTimestamp('yesterday'), null);
  assert.equal(csv.exportFileName(new Date(2026, 0, 5, 9, 7)), 'spendlog-export-20260105-0907.csv');
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
  db.runSync("INSERT INTO categories (name, color, icon) VALUES ('Pets 🐶', '#ABCDEF', 'dog')", []);
  db.runSync("INSERT INTO categories (name, color, icon, is_active) VALUES ('Old, \"retired\"', NULL, NULL, 0)", []);
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

test('a failure part-way through rolls the whole import back', () => {
  const db = freshDb();
  const parsed = csv.parseImportCsv('date,amount,category\n2025-01-01,5,Brand New\n2025-01-02,6,Brand New\n');
  const plan = dbCsv.planCsvImport(db, parsed);
  plan.expenses.push({ ...plan.expenses[0], row: 99, category: 'Not planned' });
  assert.throws(() => dbCsv.applyCsvImport(db, plan), /Row 99/);
  assert.equal(expensesOf(db).length, 0);
  assert.equal(db.getFirstSync("SELECT COUNT(*) as n FROM categories WHERE name = 'Brand New'", []).n, 0);
});
