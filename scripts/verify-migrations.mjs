#!/usr/bin/env node
// Verifies lib/db/migrations.ts without a phone: builds databases with the
// original (pre-migration) schema in Node's built-in SQLite, runs the real
// migration code against them and checks the results.
//
// Usage: npm run verify-migrations
// Runs itself once per timezone in TIMEZONES (the conversion is local-time
// dependent). Requires Node 23.6+ (TypeScript type stripping, node:sqlite).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TIMEZONES = ['Asia/Kolkata', 'America/New_York', 'Pacific/Auckland', 'UTC'];

if (!process.env.VERIFY_MIGRATIONS_CHILD) {
  let failed = false;
  for (const tz of TIMEZONES) {
    const result = spawnSync(process.execPath, ['--no-warnings', process.argv[1]], {
      env: { ...process.env, TZ: tz, VERIFY_MIGRATIONS_CHILD: '1' },
      stdio: 'inherit',
    });
    if (result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

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

const { runMigrations, getUserVersion, MIGRATIONS, legacyTimestampToEpoch } = await import(
  '../lib/db/migrations.ts'
);
const { getMonthRange, toDayKey } = await import('../lib/date.ts');

// Adapts node:sqlite to the MigrationDb interface (the expo-sqlite subset).
function wrap(raw) {
  return {
    raw,
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params = []) => raw.prepare(sql).run(...params),
    getFirstSync: (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllSync: (sql, params = []) => raw.prepare(sql).all(...params),
  };
}

// The schema exactly as the old initDatabase() and settings store created it.
function createLegacySchema(db) {
  db.execSync(`
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// Sample rows as the old app wrote them. Expense dates came from
// `toISOString().split('T')[0]`, i.e. the UTC day.
const LEGACY_EXPENSES = [
  // Ordinary daytime entry: 15 Mar 2025 14:00 IST.
  { id: 1, amount: 250, date: '2025-03-15', cat: 1, created: '2025-03-15T08:30:00.000Z', note: 'normal' },
  // Entered 16 Mar 2025 00:20 IST = 15 Mar 18:50 UTC: the UTC bug stored the 15th.
  { id: 2, amount: 120, date: '2025-03-15', cat: 1, created: '2025-03-15T18:50:00.000Z', note: 'shifted' },
  // Entered 1 Apr 2025 00:10 IST: stored under 31 Mar, i.e. the wrong month.
  { id: 3, amount: 999.5, date: '2025-03-31', cat: 2, created: '2025-03-31T18:40:00.000Z', note: 'shifted-month' },
  // Entered 1 Apr 2025 05:45 IST (00:15 UTC): correct day.
  { id: 4, amount: 40, date: '2025-04-01', cat: 2, created: '2025-04-01T00:15:00.000Z', note: 'normal' },
  // US DST start day and a leap day.
  { id: 5, amount: 75, date: '2025-03-09', cat: 3, created: '2025-03-09T10:00:00.000Z', note: 'dst' },
  { id: 6, amount: 60, date: '2024-02-29', cat: 3, created: '2024-02-29T10:00:00.000Z', note: 'leap' },
  // created_at/updated_at left to the CURRENT_TIMESTAMP default.
  { id: 7, amount: 10, date: '2025-01-01', cat: 1, created: undefined, note: 'sqlite-default' },
  // Edited later: updated_at differs from created_at.
  { id: 8, amount: 33, date: '2025-02-10', cat: 1, created: '2025-02-11T09:00:00.000Z', updated: '2025-02-12T09:00:00.000Z', note: 'edited' },
  // Will be deleted to leave a gap at the top of the id sequence.
  { id: 9, amount: 1, date: '2025-02-01', cat: 1, created: '2025-02-01T09:00:00.000Z', note: 'deleted' },
];

function seedLegacy(db) {
  createLegacySchema(db);
  for (const [name, color] of [['Food & Dining', '#FF6B6B'], ['Transportation', '#4ECDC4'], ['Shopping', '#45B7D1']]) {
    db.runSync('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', [name, color, 'food']);
  }
  db.runSync("UPDATE categories SET created_at = '2025-01-05 18:45:12' WHERE id = 1");
  db.runSync('UPDATE categories SET is_active = 0 WHERE id = 3');
  for (const e of LEGACY_EXPENSES) {
    if (e.created === undefined) {
      db.runSync('INSERT INTO expenses (id, amount, date, category_id, description) VALUES (?, ?, ?, ?, ?)', [
        e.id, e.amount, e.date, e.cat, e.note,
      ]);
    } else {
      db.runSync(
        `INSERT INTO expenses (id, amount, date, category_id, description, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.amount, e.date, e.cat, e.note, '{"k":1}', e.created, e.updated ?? e.created]
      );
    }
  }
  db.runSync('DELETE FROM expenses WHERE id = 9');
  db.runSync("INSERT INTO settings (key, value) VALUES ('currency', 'USD')");
}

// The upgrade checks below are about migration 1 alone; migration 2 (shifted
// days) is covered by scripts/test-shifted-dates.mjs.
const MIGRATION_1 = MIGRATIONS.filter((m) => m.version === 1);
// The income/recurring checks add migration 3 on top of that; the full chain
// (1, 2, 3 in order) is checked further down.
const MIGRATION_3 = MIGRATIONS.filter((m) => m.version === 3);
const WITHOUT_SHIFTED_DATES = MIGRATIONS.filter((m) => m.version !== 2);
const LATEST = MIGRATIONS.at(-1).version;

const localNoon = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const tz = process.env.TZ;
const dir = mkdtempSync(join(tmpdir(), 'spendlog-migrations-'));
const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

try {
  // --- Upgrade of an existing install ---------------------------------------
  const dbPath = join(dir, 'spendlog.db');
  const db = wrap(new DatabaseSync(dbPath));
  seedLegacy(db);
  const legacyRows = db.getAllSync('SELECT * FROM expenses ORDER BY id');
  const backupPath = join(dir, 'spendlog-backup.db');
  let backupCalls = 0;

  const result = runMigrations(db, MIGRATION_1, {
    backup: () => {
      backupCalls++;
      db.runSync('VACUUM INTO ?', [backupPath]);
    },
  });

  check('migrates from version 0 to 1', () => {
    assert.deepEqual(result, { fromVersion: 0, toVersion: 1 });
  });

  check('backup taken once, before changes, with the old data', () => {
    assert.equal(backupCalls, 1);
    assert.ok(existsSync(backupPath));
    const backup = wrap(new DatabaseSync(backupPath, { readOnly: true }));
    assert.equal(getUserVersion(backup), 0);
    assert.deepEqual(backup.getAllSync('SELECT * FROM expenses ORDER BY id'), legacyRows);
    backup.raw.close();
  });

  check('no rows lost, ids and fields preserved', () => {
    const rows = db.getAllSync('SELECT * FROM expenses ORDER BY id');
    assert.deepEqual(rows.map((r) => r.id), legacyRows.map((r) => r.id));
    for (const [i, row] of rows.entries()) {
      const old = legacyRows[i];
      for (const key of ['amount', 'category_id', 'location', 'description', 'metadata']) {
        assert.equal(row[key], old[key], `expense ${row.id} ${key}`);
      }
    }
    const cats = db.getAllSync('SELECT id, name, is_active FROM categories ORDER BY id');
    assert.deepEqual(cats.map((c) => [c.id, c.name, c.is_active]), [
      [1, 'Food & Dining', 1],
      [2, 'Transportation', 1],
      [3, 'Shopping', 0],
    ]);
    assert.equal(db.getFirstSync("SELECT value FROM settings WHERE key = 'currency'").value, 'USD');
  });

  check('columns are INTEGER and values are integers', () => {
    const types = (table) =>
      Object.fromEntries(db.getAllSync(`PRAGMA table_info(${table})`).map((c) => [c.name, c.type]));
    assert.equal(types('expenses').date, 'INTEGER');
    assert.equal(types('expenses').created_at, 'INTEGER');
    assert.equal(types('expenses').updated_at, 'INTEGER');
    assert.equal(types('categories').created_at, 'INTEGER');
    const bad = db.getFirstSync(`
      SELECT
        (SELECT COUNT(*) FROM expenses WHERE typeof(date) != 'integer' OR typeof(created_at) != 'integer'
                                          OR typeof(updated_at) != 'integer') +
        (SELECT COUNT(*) FROM categories WHERE typeof(created_at) != 'integer') AS n`);
    assert.equal(bad.n, 0);
  });

  check('expense dates become local noon of the same calendar day', () => {
    for (const row of db.getAllSync('SELECT id, date FROM expenses')) {
      const old = LEGACY_EXPENSES.find((e) => e.id === row.id);
      const [y, m, d] = old.date.split('-').map(Number);
      assert.equal(row.date, localNoon(y, m, d), `expense ${row.id}`);
      assert.equal(toDayKey(row.date), old.date, `expense ${row.id} day key`);
    }
  });

  check('timestamps parsed as UTC (ISO and CURRENT_TIMESTAMP formats)', () => {
    const e2 = db.getFirstSync('SELECT created_at, updated_at FROM expenses WHERE id = 2');
    assert.equal(e2.created_at, Date.UTC(2025, 2, 15, 18, 50));
    const e8 = db.getFirstSync('SELECT created_at, updated_at FROM expenses WHERE id = 8');
    assert.equal(e8.updated_at, Date.UTC(2025, 1, 12, 9));
    const c1 = db.getFirstSync('SELECT created_at FROM categories WHERE id = 1');
    assert.equal(c1.created_at, Date.UTC(2025, 0, 5, 18, 45, 12));
    const e7 = db.getFirstSync('SELECT created_at FROM expenses WHERE id = 7');
    assert.ok(Math.abs(e7.created_at - Date.now()) < 60_000, 'CURRENT_TIMESTAMP default is ~now');
    assert.equal(legacyTimestampToEpoch('2025-01-05 18:45:12'), Date.UTC(2025, 0, 5, 18, 45, 12));
    assert.equal(legacyTimestampToEpoch('2025-01-05T18:45:12.123Z'), Date.UTC(2025, 0, 5, 18, 45, 12, 123));
    assert.equal(legacyTimestampToEpoch('2025-01-05T23:15:12+05:30'), Date.UTC(2025, 0, 5, 17, 45, 12));
    assert.equal(legacyTimestampToEpoch('garbage'), null);
  });

  check('local month range queries match the stored calendar days', () => {
    const inMonth = (month) => {
      const { start, end } = getMonthRange(month);
      return db
        .getAllSync('SELECT id FROM expenses WHERE date >= ? AND date < ? ORDER BY id', [start, end])
        .map((r) => r.id);
    };
    assert.deepEqual(inMonth('2025-03'), [1, 2, 3, 5]);
    assert.deepEqual(inMonth('2025-04'), [4]);
    assert.deepEqual(inMonth('2024-02'), [6]);
  });

  check('indexes recreated and AUTOINCREMENT sequence kept past deleted ids', () => {
    const indexes = db
      .getAllSync("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'expenses' ORDER BY name")
      .map((r) => r.name);
    assert.deepEqual(indexes, ['idx_expenses_category', 'idx_expenses_date']);
    assert.equal(db.getFirstSync("SELECT seq FROM sqlite_sequence WHERE name = 'expenses'").seq, 9);
    const { lastInsertRowid } = db.runSync(
      'INSERT INTO expenses (amount, date, category_id, created_at, updated_at) VALUES (1, 1, 1, 1, 1)'
    );
    assert.equal(Number(lastInsertRowid), 10);
    db.runSync('DELETE FROM expenses WHERE id = 10');
  });

  check('foreign keys intact', () => {
    assert.deepEqual(db.getAllSync('PRAGMA foreign_key_check'), []);
    assert.match(
      db.getFirstSync("SELECT sql FROM sqlite_master WHERE name = 'expenses'").sql,
      /REFERENCES categories\(id\)/
    );
  });

  // --- Income and recurring (migration 'income-and-recurring') ---------------
  check('income: migration 3 runs on top of 1', () => {
    assert.deepEqual(runMigrations(db, MIGRATION_3), { fromVersion: 1, toVersion: LATEST });
    const indexes = db
      .getAllSync("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'expenses' ORDER BY name")
      .map((r) => r.name);
    assert.deepEqual(indexes, ['idx_expenses_category', 'idx_expenses_date', 'idx_expenses_occurrence']);
  });

  check('income: existing expenses gain empty recurring columns, nothing else changes', () => {
    const columns = db.getAllSync('PRAGMA table_info(expenses)').map((c) => c.name);
    assert.deepEqual(columns.slice(-2), ['recurring_rule_id', 'occurrence_date']);
    const linked = db.getFirstSync(
      'SELECT COUNT(*) AS n FROM expenses WHERE recurring_rule_id IS NOT NULL OR occurrence_date IS NOT NULL'
    );
    assert.equal(linked.n, 0);
  });

  check('income: tables created, income categories seeded apart from expense categories', () => {
    const tables = db
      .getAllSync("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((r) => r.name);
    assert.deepEqual(tables, ['categories', 'expenses', 'income_categories', 'incomes', 'recurring_rules', 'settings']);
    assert.deepEqual(
      db.getAllSync('SELECT name FROM income_categories ORDER BY id').map((r) => r.name),
      ['Salary', 'Freelance', 'Interest', 'Refund', 'Other']
    );
    assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM categories').n, 3);
    assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM incomes').n, 0);
  });

  check('recurring: one row per rule and occurrence day (unique index), manual rows unaffected', () => {
    const insert = (table, rule, day) =>
      db.runSync(
        `INSERT INTO ${table} (amount, date, category_id, recurring_rule_id, occurrence_date, created_at, updated_at)
         VALUES (1, ?, 1, ?, ?, 1, 1)`,
        [day, rule, rule === null ? null : day]
      );
    const day = localNoon(2025, 5, 1);
    for (const table of ['expenses', 'incomes']) {
      insert(table, 1, day);
      assert.throws(() => insert(table, 1, day), /UNIQUE/);
      insert(table, 2, day); // another rule, same day
      insert(table, null, day); // manual rows: no key
      insert(table, null, day);
      db.runSync(`DELETE FROM ${table} WHERE amount = 1 AND created_at = 1`);
    }
    assert.throws(
      () =>
        db.runSync(
          `INSERT INTO recurring_rules (kind, amount, category_id, frequency, interval, start_date, created_at, updated_at)
           VALUES ('expense', 1, 1, 'fortnightly', 1, 1, 1, 1)`
        ),
      /CHECK/
    );
  });

  check('idempotent: rerunning is a no-op, and so is replaying migrations 1 and 3', () => {
    const snapshot = db.getAllSync('SELECT * FROM expenses ORDER BY id');
    const incomeCategories = db.getAllSync('SELECT * FROM income_categories ORDER BY id');
    let calls = 0;
    assert.deepEqual(runMigrations(db, MIGRATIONS, { backup: () => calls++ }), {
      fromVersion: LATEST,
      toVersion: LATEST,
    });
    assert.equal(calls, 0);
    db.execSync('PRAGMA user_version = 0');
    // Migration 2 from version 0 would (correctly) move some of these days.
    runMigrations(db, WITHOUT_SHIFTED_DATES);
    assert.deepEqual(db.getAllSync('SELECT * FROM expenses ORDER BY id'), snapshot);
    assert.deepEqual(db.getAllSync('SELECT * FROM income_categories ORDER BY id'), incomeCategories);
    assert.equal(getUserVersion(db), LATEST);
  });
  db.raw.close();

  // --- Fresh install ----------------------------------------------------------
  check('fresh install gets the new schema and no backup', () => {
    const fresh = wrap(new DatabaseSync(':memory:'));
    let calls = 0;
    runMigrations(fresh, MIGRATIONS, { backup: () => calls++ });
    assert.equal(calls, 0);
    assert.equal(getUserVersion(fresh), LATEST);
    const names = fresh
      .getAllSync("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((r) => r.name);
    assert.deepEqual(names, [
      'categories', 'date_review', 'expenses', 'income_categories', 'incomes', 'recurring_rules', 'settings',
    ]);
    assert.equal(fresh.getFirstSync('SELECT COUNT(*) AS n FROM income_categories').n, 5);
    fresh.raw.close();
  });

  // --- The whole chain, in order ----------------------------------------------
  // Expense rows without the two columns migration 3 adds.
  const expenseRows = (d) =>
    d
      .getAllSync('SELECT * FROM expenses ORDER BY id')
      .map(({ recurring_rule_id, occurrence_date, ...row }) => row);
  const migrated = (d) => ({
    version: getUserVersion(d),
    tables: d
      .getAllSync("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((r) => r.name),
    columns: d.getAllSync('PRAGMA table_info(expenses)').map((c) => c.name).slice(-2),
  });
  const ALL_TABLES = [
    'categories', 'date_review', 'expenses', 'income_categories', 'incomes', 'recurring_rules', 'settings',
  ];

  check('chain from version 0: 1, 2, 3 in order; 3 keeps every row migration 2 left', () => {
    const full = wrap(new DatabaseSync(':memory:'));
    seedLegacy(full);
    assert.deepEqual(runMigrations(full), { fromVersion: 0, toVersion: LATEST });
    assert.deepEqual(migrated(full), {
      version: LATEST,
      tables: ALL_TABLES,
      columns: ['recurring_rule_id', 'occurrence_date'],
    });
    const upTo2 = wrap(new DatabaseSync(':memory:'));
    seedLegacy(upTo2);
    runMigrations(upTo2, MIGRATIONS.filter((m) => m.version <= 2));
    assert.deepEqual(expenseRows(full), expenseRows(upTo2));
    assert.deepEqual(
      full.getAllSync('SELECT * FROM date_review ORDER BY expense_id'),
      upTo2.getAllSync('SELECT * FROM date_review ORDER BY expense_id')
    );
    assert.equal(full.getFirstSync('SELECT COUNT(*) AS n FROM expenses').n, legacyRows.length);
    full.raw.close();
    upTo2.raw.close();
  });

  check('chain from version 1 (the released app): 2 then 3, rows kept', () => {
    const v1 = wrap(new DatabaseSync(':memory:'));
    seedLegacy(v1);
    runMigrations(v1, MIGRATION_1);
    const migratedAt = Date.now();
    // Added by the released app after the conversion; migration 2 leaves it alone.
    v1.runSync(
      'INSERT INTO expenses (amount, date, category_id, created_at, updated_at) VALUES (7, ?, 1, ?, ?)',
      [localNoon(2025, 6, 1), migratedAt + 1, migratedAt + 1]
    );
    const options = { originalSchemaMigratedAt: () => migratedAt + 1 };
    const before = v1.getAllSync('SELECT * FROM expenses ORDER BY id');
    assert.deepEqual(runMigrations(v1, MIGRATIONS, options), { fromVersion: 1, toVersion: LATEST });
    assert.deepEqual(migrated(v1), {
      version: LATEST,
      tables: ALL_TABLES,
      columns: ['recurring_rule_id', 'occurrence_date'],
    });
    const after = expenseRows(v1);
    assert.equal(after.length, before.length);
    // Only dates migration 2 recorded in date_review as fixed may differ.
    const fixed = new Set(
      v1.getAllSync("SELECT expense_id FROM date_review WHERE status = 'fixed'").map((r) => r.expense_id)
    );
    after.forEach((row, i) => {
      const { date, ...rest } = row;
      const { date: oldDate, ...oldRest } = before[i];
      assert.deepEqual(rest, oldRest);
      if (!fixed.has(row.id)) assert.equal(date, oldDate);
    });
    assert.equal(v1.getFirstSync('SELECT COUNT(*) AS n FROM income_categories').n, 5);
    v1.raw.close();
  });

  // --- Failure rolls back -----------------------------------------------------
  check('a bad row aborts the migration and leaves the old data untouched', () => {
    const broken = wrap(new DatabaseSync(':memory:'));
    seedLegacy(broken);
    broken.runSync("INSERT INTO expenses (amount, date, category_id) VALUES (5, '15/03/2025', 1)");
    const before = broken.getAllSync('SELECT * FROM expenses ORDER BY id');
    assert.throws(() => runMigrations(broken), /rolled back: Unrecognised expense date/);
    assert.equal(getUserVersion(broken), 0);
    assert.deepEqual(broken.getAllSync('SELECT * FROM expenses ORDER BY id'), before);
    const tables = broken.getAllSync("SELECT name FROM sqlite_master WHERE name LIKE '%_new'");
    assert.deepEqual(tables, []);
    broken.raw.close();
  });

  check('a backup failure aborts before anything changes', () => {
    const noBackup = wrap(new DatabaseSync(':memory:'));
    seedLegacy(noBackup);
    assert.throws(
      () => runMigrations(noBackup, MIGRATIONS, { backup: () => { throw new Error('disk full'); } }),
      /disk full/
    );
    assert.equal(getUserVersion(noBackup), 0);
    assert.equal(
      noBackup.getAllSync('PRAGMA table_info(expenses)').find((c) => c.name === 'date').type,
      'TEXT'
    );
    noBackup.raw.close();
  });

  console.log(`ok  ${tz.padEnd(18)} ${checks.length} checks passed`);
} catch (error) {
  console.error(`FAIL ${tz} after ${checks.length} passing checks:`);
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
