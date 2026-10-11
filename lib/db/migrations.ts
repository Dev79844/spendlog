// Schema migrations, tracked with `PRAGMA user_version`.
//
// How to change the schema: append a migration with the next version number
// to MIGRATIONS. Never edit or reorder a migration that has shipped; phones
// that already ran it will not run it again. Each migration runs inside its
// own transaction together with the user_version bump, so it either fully
// applies or leaves the database untouched.
//
// This file may only import pure modules (lib/date.ts), never React Native or
// expo, so that scripts/verify-migrations.mjs can run it under plain Node.

import { parseExpenseDay, parseTimestamp } from '../date';

type SQLValue = string | number | null;

// The subset of expo-sqlite's SQLiteDatabase the migrations use.
export interface MigrationDb {
  execSync(sql: string): void;
  runSync(sql: string, params: SQLValue[]): unknown;
  getFirstSync<T>(sql: string, params: SQLValue[]): T | null;
  getAllSync<T>(sql: string, params: SQLValue[]): T[];
}

export interface Migration {
  version: number;
  name: string;
  up(db: MigrationDb): void;
}

export interface RunMigrationsOptions {
  // Called once before the first pending migration when the database already
  // holds data. Throwing aborts the run before anything is changed.
  backup?: (fromVersion: number) => void;
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
}

export function getUserVersion(db: MigrationDb): number {
  return db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version ?? 0;
}

function tableExists(db: MigrationDb, name: string): boolean {
  return (
    db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [name]
    ) !== null
  );
}

function hasUserTables(db: MigrationDb): boolean {
  return (
    db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      []
    ) !== null
  );
}

export function runMigrations(
  db: MigrationDb,
  migrations: Migration[] = MIGRATIONS,
  options: RunMigrationsOptions = {}
): MigrationResult {
  const fromVersion = getUserVersion(db);
  const pending = migrations
    .filter((m) => m.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return { fromVersion, toVersion: fromVersion };

  if (options.backup && hasUserTables(db)) {
    options.backup(fromVersion);
  }

  // Table rebuilds drop and recreate tables that other tables reference, so
  // foreign key enforcement is turned off for the duration (it cannot be
  // changed inside a transaction) and restored afterwards.
  const foreignKeys = db.getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys', [])?.foreign_keys ?? 0;
  db.execSync('PRAGMA foreign_keys = OFF');
  try {
    for (const migration of pending) {
      db.execSync('BEGIN IMMEDIATE');
      try {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
        db.execSync('COMMIT');
      } catch (error) {
        db.execSync('ROLLBACK');
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed and was rolled back: ${
            (error as Error).message
          }`
        );
      }
    }
  } finally {
    db.execSync(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }

  return { fromVersion, toVersion: getUserVersion(db) };
}

// ---------------------------------------------------------------------------
// Legacy value parsing (used by migration 1)
//
// Both delegate to the parsers in lib/date.ts that CSV import also uses, so
// a migrated row and an imported row end up identical.

// Old expense dates were 'YYYY-MM-DD'. They are read as a local calendar day
// and stored as local noon, the same convention as new entries.
export function legacyDayToEpoch(value: unknown): number {
  const ms = typeof value === 'string' ? parseExpenseDay(value) : null;
  if (ms === null) throw new Error(`Unrecognised expense date: ${JSON.stringify(value)}`);
  return ms;
}

// Old timestamps came from two writers, both UTC:
// - SQLite's CURRENT_TIMESTAMP default: 'YYYY-MM-DD HH:MM:SS', no zone, read as UTC.
// - JS `new Date().toISOString()`: 'YYYY-MM-DDTHH:MM:SS.sssZ'.
// Returns null when the value cannot be parsed.
export function legacyTimestampToEpoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof value === 'string' ? parseTimestamp(value) : null;
}

// ---------------------------------------------------------------------------
// Migrations

const CREATE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;

const categoriesTable = (name: string) => `
  CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`;

const expensesTable = (name: string) => `
  CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    date INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    location TEXT,
    description TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`;

const EXPENSE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);`;

interface TableFingerprint {
  count: number;
  idSum: number;
}

function fingerprint(db: MigrationDb, table: string, extra = ''): TableFingerprint & Record<string, number> {
  return db.getFirstSync<TableFingerprint & Record<string, number>>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(id), 0) AS idSum${extra} FROM ${table}`,
    []
  )!;
}

function assertSameRows(table: string, before: Record<string, number>, after: Record<string, number>) {
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      throw new Error(`${table}: ${key} changed from ${before[key]} to ${after[key]} during migration`);
    }
  }
}

function getSequence(db: MigrationDb, table: string): number | null {
  if (!tableExists(db, 'sqlite_sequence')) return null;
  return db.getFirstSync<{ seq: number }>('SELECT seq FROM sqlite_sequence WHERE name = ?', [table])?.seq ?? null;
}

// Keep AUTOINCREMENT from handing out ids of rows that were deleted before
// the rebuild.
function restoreSequence(db: MigrationDb, table: string, seq: number | null) {
  if (seq === null) return;
  db.runSync('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?', [seq, table]);
  db.runSync(
    'INSERT INTO sqlite_sequence (name, seq) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ?)',
    [table, seq, table]
  );
}

function columnType(db: MigrationDb, table: string, column: string): string | null {
  const columns = db.getAllSync<{ name: string; type: string }>(`PRAGMA table_info(${table})`, []);
  return columns.find((c) => c.name === column)?.type.toUpperCase() ?? null;
}

function rebuildCategories(db: MigrationDb, now: number) {
  if (!tableExists(db, 'categories')) {
    db.execSync(categoriesTable('categories'));
    return;
  }
  if (columnType(db, 'categories', 'created_at') === 'INTEGER') return;

  const before = fingerprint(db, 'categories');
  const seq = getSequence(db, 'categories');
  const rows = db.getAllSync<{
    id: number;
    name: string;
    color: string | null;
    icon: string | null;
    is_active: number | null;
    created_at: unknown;
  }>('SELECT id, name, color, icon, is_active, created_at FROM categories', []);

  db.execSync('DROP TABLE IF EXISTS categories_new');
  db.execSync(categoriesTable('categories_new'));
  for (const row of rows) {
    db.runSync(
      'INSERT INTO categories_new (id, name, color, icon, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [row.id, row.name, row.color, row.icon, row.is_active, legacyTimestampToEpoch(row.created_at) ?? now]
    );
  }
  assertSameRows('categories', before, fingerprint(db, 'categories_new'));

  db.execSync('DROP TABLE categories');
  db.execSync('ALTER TABLE categories_new RENAME TO categories');
  restoreSequence(db, 'categories', seq);
}

function rebuildExpenses(db: MigrationDb) {
  if (!tableExists(db, 'expenses')) {
    db.execSync(expensesTable('expenses'));
    db.execSync(EXPENSE_INDEXES);
    return;
  }
  if (columnType(db, 'expenses', 'date') === 'INTEGER') {
    db.execSync(EXPENSE_INDEXES);
    return;
  }

  const amountSum = ', COALESCE(SUM(amount), 0) AS amountSum, COALESCE(SUM(category_id), 0) AS categorySum';
  const before = fingerprint(db, 'expenses', amountSum);
  const seq = getSequence(db, 'expenses');
  const rows = db.getAllSync<{
    id: number;
    amount: number;
    date: unknown;
    category_id: number;
    location: string | null;
    description: string | null;
    metadata: string | null;
    created_at: unknown;
    updated_at: unknown;
  }>('SELECT * FROM expenses', []);

  db.execSync('DROP TABLE IF EXISTS expenses_new');
  db.execSync(expensesTable('expenses_new'));
  for (const row of rows) {
    const date = legacyDayToEpoch(row.date);
    // created_at/updated_at always had defaults, so a missing or unreadable
    // value is not expected; fall back rather than refuse to migrate.
    const createdAt = legacyTimestampToEpoch(row.created_at) ?? date;
    const updatedAt = legacyTimestampToEpoch(row.updated_at) ?? createdAt;
    db.runSync(
      `INSERT INTO expenses_new (id, amount, date, category_id, location, description, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.amount,
        date,
        row.category_id,
        row.location,
        row.description,
        row.metadata,
        createdAt,
        updatedAt,
      ]
    );
  }
  assertSameRows('expenses', before, fingerprint(db, 'expenses_new', amountSum));

  db.execSync('DROP TABLE expenses');
  db.execSync('ALTER TABLE expenses_new RENAME TO expenses');
  db.execSync(EXPENSE_INDEXES);
  restoreSequence(db, 'expenses', seq);
}

export const MIGRATIONS: Migration[] = [
  {
    // Baseline for fresh installs, and conversion of the original schema
    // (TEXT dates/timestamps, no user_version) to epoch milliseconds.
    version: 1,
    name: 'epoch-ms-dates',
    up(db) {
      db.execSync(CREATE_SETTINGS);
      rebuildCategories(db, Date.now());
      rebuildExpenses(db);
    },
  },
];
