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

export interface MigrationContext {
  // user_version when this run started.
  fromVersion: number;
  // When this database was converted from the original schema (version 0),
  // as epoch ms: the time of its v0 backup. Null if unknown, e.g. a fresh
  // install that never had the original schema. Only looked up when the run
  // starts above version 0; in a run from version 0 every row predates it.
  originalSchemaMigratedAt: number | null;
}

export interface Migration {
  version: number;
  name: string;
  up(db: MigrationDb, context: MigrationContext): void;
}

export interface RunMigrationsOptions {
  // Called once before the first pending migration when the database already
  // holds data. Throwing aborts the run before anything is changed.
  backup?: (fromVersion: number) => void;
  // Supplies MigrationContext.originalSchemaMigratedAt.
  originalSchemaMigratedAt?: () => number | null;
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

  const context: MigrationContext = {
    fromVersion,
    originalSchemaMigratedAt:
      fromVersion > 0 ? (options.originalSchemaMigratedAt?.() ?? null) : null,
  };

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
        migration.up(db, context);
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

// ---------------------------------------------------------------------------
// Expense days shifted by the original app (used by migration 2)
//
// Before migration 1 the app stored an expense's day as
// `date.toISOString().split('T')[0]`: the UTC day of a local Date, not its
// local day. Migration 1 kept those days as they were, so some rows are a day
// off. Which ones follows from how the old screens built that Date:
//
// - Add screen: `new Date()` when the screen opened. Picking a day kept that
//   time of day (the Android picker only sets year/month/day). So the stored
//   day is the picked day moved by (UTC day - local day) at the time of day
//   the screen was opened. East of UTC that is one day early when it was
//   opened between local midnight and the UTC offset (00:00-05:29 in India);
//   west of UTC one day late from 24h minus the offset to midnight (19:00-23:59
//   in New York in winter); in UTC never.
// - Edit screen: the form loaded the stored day as local midnight, and a day
//   picked there kept midnight. East of UTC local midnight falls on the
//   previous UTC day, so every save moved the day back by one; elsewhere no
//   save moved it.
//
// Only the save time survives (created_at), not when the screen was opened,
// and only the last edit (updated_at). So:
// - Fixed: unedited rows where exactly one shift fits, and it is the same
//   across the whole hour before they were saved, assuming the add screen was
//   open for less than LEGACY_ADD_SCREEN_MAX_OPEN_MS.
// - Left to the user ('pending' in date_review): rows saved within that hour
//   after a boundary (the screen may have been opened on the other side of
//   it), rows where a DST change makes more than one shift fit, and edited
//   rows. An old edit east of UTC moved the day back one from
//   what the form showed, but earlier saves may have moved it too, and the
//   user may have picked a later day to make up for it.
// Days are worked out in the device's current timezone. Rows created after
// the app stopped using the old code (MigrationContext) are never looked at.

const DAY_MS = 86_400_000;

// How long the old add screen is assumed to have been open, at most, before
// the expense was saved.
export const LEGACY_ADD_SCREEN_MAX_OPEN_MS = 60 * 60_000;

// Days since 1970-01-01 of the calendar day containing `ms`.
function localDayNumber(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

const utcDayNumber = (ms: number) => Math.floor(ms / DAY_MS);

// A local time on the local day `day`.
function localTimeOn(day: number, hours = 0, minutes = 0, seconds = 0): number {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes, seconds).getTime();
}

// The stored form of an expense day: local noon.
const expenseDayOf = (day: number) => localTimeOn(day, 12);

// `ms`'s local time of day, on the local day `day`.
function sameTimeOn(day: number, ms: number): number {
  const t = new Date(ms);
  return localTimeOn(day, t.getHours(), t.getMinutes(), t.getSeconds());
}

// How many days the old `toISOString()` day moved a Date at `ms`:
// UTC day minus local day, so -1, 0 or 1.
const legacyShiftAt = (ms: number) => utcDayNumber(ms) - localDayNumber(ms);

export type DateReviewReason = 'add-shifted' | 'add-uncertain' | 'edited';

export type LegacyDateVerdict =
  | { action: 'none' }
  | { action: 'fix' | 'review'; reason: DateReviewReason; suggestedDate: number };

// Decides what to do with one expense row (epoch ms values, after migration
// 1). Rows created at or after `legacyBefore` were written by the fixed app.
export function classifyLegacyExpenseDate(
  row: { date: number; created_at: number; updated_at: number },
  legacyBefore: number
): LegacyDateVerdict {
  if (!(row.created_at < legacyBefore)) return { action: 'none' };
  const stored = localDayNumber(row.date);
  const saved = row.created_at;
  const opened = saved - LEGACY_ADD_SCREEN_MAX_OPEN_MS;

  // Add screen: stored = picked + shift, where shift is legacyShiftAt() on
  // the picked day at the time of day the screen was opened, somewhere in
  // [opened, saved]. On a given day the shift changes once at most, so
  // checking both ends tells whether a shift fits. The picker allowed no
  // future days, so the picked day is at most the day it was saved.
  const shiftsOn = (picked: number) => [
    legacyShiftAt(sameTimeOn(picked, saved)),
    legacyShiftAt(sameTimeOn(picked, opened)),
  ];
  const possible = [-1, 0, 1].filter(
    (shift) => stored - shift <= localDayNumber(saved) && shiftsOn(stored - shift).includes(shift)
  );
  // Preferring the shift at the save time when both ±1 fit (not seen in
  // practice).
  const addShift =
    possible.find((shift) => shift !== 0 && shiftsOn(stored - shift)[0] === shift) ??
    possible.find((shift) => shift !== 0) ??
    0;
  const addCertain =
    addShift !== 0 &&
    possible.length === 1 &&
    shiftsOn(stored - addShift).every((shift) => shift === addShift) &&
    localDayNumber(opened) === localDayNumber(saved);
  const suggestedDate = expenseDayOf(stored - addShift);

  if (row.updated_at === row.created_at) {
    if (addShift === 0) return { action: 'none' };
    return addCertain
      ? { action: 'fix', reason: 'add-shifted', suggestedDate }
      : { action: 'review', reason: 'add-uncertain', suggestedDate };
  }

  // Last saved by the old edit screen, which showed `stored + 1` if a save at
  // local midnight lands on the previous UTC day here.
  if (row.updated_at < legacyBefore && legacyShiftAt(localTimeOn(stored + 1)) === -1) {
    return { action: 'review', reason: 'edited', suggestedDate: expenseDayOf(stored + 1) };
  }
  if (addShift !== 0) return { action: 'review', reason: 'edited', suggestedDate };
  return { action: 'none' };
}

// One row per expense migration 2 looked at. `status` is 'fixed' (moved by
// the migration), 'pending' (waiting for the user), or what the user chose:
// 'moved', 'kept', 'undone' (a fix put back). Rows are matched to expenses by
// id and created_at, so a reused id never inherits a review.
const CREATE_DATE_REVIEW = `
  CREATE TABLE IF NOT EXISTS date_review (
    expense_id INTEGER PRIMARY KEY,
    expense_created_at INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    original_date INTEGER NOT NULL,
    suggested_date INTEGER NOT NULL,
    resolved_at INTEGER
  )`;

function reviewShiftedDates(db: MigrationDb, context: MigrationContext) {
  db.execSync(CREATE_DATE_REVIEW);
  // A run from version 0 converted every row just now (migration 1); later,
  // only rows from before that conversion. Unknown means no old rows.
  const legacyBefore =
    context.fromVersion === 0 ? Number.POSITIVE_INFINITY : context.originalSchemaMigratedAt;
  if (legacyBefore === null) return;

  const sums = ', COALESCE(SUM(amount), 0) AS amountSum, COALESCE(SUM(category_id), 0) AS categorySum';
  const before = fingerprint(db, 'expenses', sums);
  const rows = db.getAllSync<{ id: number; date: number; created_at: number; updated_at: number }>(
    'SELECT id, date, created_at, updated_at FROM expenses ORDER BY id',
    []
  );
  const done = new Set(
    db.getAllSync<{ expense_id: number }>('SELECT expense_id FROM date_review', []).map((r) => r.expense_id)
  );

  const expected = new Map(rows.map((r) => [r.id, r.date]));
  for (const row of rows) {
    if (done.has(row.id)) continue;
    const verdict = classifyLegacyExpenseDate(row, legacyBefore);
    if (verdict.action === 'none') continue;
    if (verdict.action === 'fix') {
      db.runSync('UPDATE expenses SET date = ? WHERE id = ?', [verdict.suggestedDate, row.id]);
      expected.set(row.id, verdict.suggestedDate);
    }
    db.runSync(
      `INSERT INTO date_review (expense_id, expense_created_at, reason, status, original_date, suggested_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.created_at,
        verdict.reason,
        verdict.action === 'fix' ? 'fixed' : 'pending',
        row.date,
        verdict.suggestedDate,
      ]
    );
  }

  // Only the planned dates changed, and nothing else.
  assertSameRows('expenses', before, fingerprint(db, 'expenses', sums));
  for (const row of db.getAllSync<{ id: number; date: number }>('SELECT id, date FROM expenses', [])) {
    if (expected.get(row.id) !== row.date) {
      throw new Error(`expenses: date of ${row.id} is ${row.date}, expected ${expected.get(row.id)}`);
    }
  }
}

// --- Income and recurring rules ----------------------------------------------
//
// Income lives in its own tables (`incomes`, `income_categories`) rather than
// a type column on `expenses`, so every existing expense query, total and
// chart keeps meaning "money spent" without a new filter. Recurring rules
// (`recurring_rules`) generate ordinary rows in either table; a generated row
// carries `recurring_rule_id` + `occurrence_date`, unique together, so the
// catch-up can never insert the same occurrence twice. Every statement is
// idempotent (IF NOT EXISTS / column checks), so replaying it is harmless.

function columnExists(db: MigrationDb, table: string, column: string): boolean {
  return columnType(db, table, column) !== null;
}

// Seeded once by the migration. Frozen here: a later change to the defaults
// must not change what this shipped migration does.
const INCOME_CATEGORY_SEED: [name: string, color: string, icon: string][] = [
  ['Salary', '#2E7D32', 'briefcase'],
  ['Freelance', '#3498DB', 'laptop'],
  ['Interest', '#F7DC6F', 'bank'],
  ['Refund', '#4ECDC4', 'cash-refund'],
  ['Other', '#BDC3C7', 'dots-horizontal'],
];

function addIncomeAndRecurring(db: MigrationDb, now: number) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
      amount REAL NOT NULL,
      category_id INTEGER NOT NULL,
      location TEXT,
      description TEXT,
      frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
      start_date INTEGER NOT NULL,
      end_date INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_occurrence INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      date INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT,
      metadata TEXT,
      recurring_rule_id INTEGER,
      occurrence_date INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES income_categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
    CREATE INDEX IF NOT EXISTS idx_incomes_category ON incomes(category_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_incomes_occurrence ON incomes(recurring_rule_id, occurrence_date);
  `);

  // Added columns, not a table rebuild: existing expense rows are untouched.
  if (!columnExists(db, 'expenses', 'recurring_rule_id')) {
    db.execSync('ALTER TABLE expenses ADD COLUMN recurring_rule_id INTEGER');
  }
  if (!columnExists(db, 'expenses', 'occurrence_date')) {
    db.execSync('ALTER TABLE expenses ADD COLUMN occurrence_date INTEGER');
  }
  db.execSync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_occurrence ON expenses(recurring_rule_id, occurrence_date)'
  );

  const seeded = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM income_categories', [])!.n;
  if (seeded === 0) {
    for (const [name, color, icon] of INCOME_CATEGORY_SEED) {
      db.runSync('INSERT INTO income_categories (name, color, icon, created_at) VALUES (?, ?, ?, ?)', [
        name,
        color,
        icon,
        now,
      ]);
    }
  }
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
  {
    // Moves expense days the original app's UTC bug provably shifted and
    // lists the doubtful ones for the Review dates screen. Independent of
    // other migrations, so renumbering it only means changing `version`.
    version: 2,
    name: 'shifted-expense-dates',
    up: reviewShiftedDates,
  },
  {
    // Income tables, recurring rules, and the link columns on expenses.
    // Additive only (no table rebuild), after migration 2's date fixes.
    version: 3,
    name: 'income-and-recurring',
    up(db) {
      addIncomeAndRecurring(db, Date.now());
    },
  },
];
