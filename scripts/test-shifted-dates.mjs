// Tests for migration 2 (expense days shifted by the original app) and the
// Review dates queries. Runs under plain Node (no device):
//   npm test            (runs this file under TZ=UTC, Asia/Kolkata, America/New_York)
//
// The fixtures are written the way the pre-migration app wrote them: the add
// and edit screens are simulated below with the old code's own Date handling
// (`toISOString().split('T')[0]`), in the timezone the test runs in. So each
// case knows the day the user meant, and the checks compare against it.
// No real user data.

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

const { runMigrations, MIGRATIONS, getUserVersion } = await import('../lib/db/migrations.ts');
const { getDateReviewItems, getOpenDateReviewCount, resolveDateReview } = await import(
  '../lib/db/date-review.ts'
);
const { toDayKey } = await import('../lib/date.ts');

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONE = { UTC: 'utc', 'Asia/Kolkata': 'ist', 'Asia/Calcutta': 'ist', 'America/New_York': 'ny' }[TZ];
if (!ZONE) throw new Error(`Run with TZ=UTC, Asia/Kolkata or America/New_York (got ${TZ})`);

const MIN = 60_000;
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

// --- The pre-migration app ---------------------------------------------------

// lib/db/index.ts formatDate() before migration 1.
const oldFormatDate = (date) => date.toISOString().split('T')[0];

// The old add screen: `new Date()` when it opened; the date picker kept that
// time of day. Saved `openFor` ms later.
function oldAdd({ opened, pick, openFor = 2 * MIN }) {
  let date = new Date(opened);
  if (pick) date = new Date(pick[0], pick[1] - 1, pick[2], date.getHours(), date.getMinutes());
  const saved = new Date(opened + openFor).toISOString();
  return { date: oldFormatDate(date), created_at: saved, updated_at: saved };
}

// The old edit screen: loads the stored day as local midnight, saves it back.
function oldEdit(row, { at, pick }) {
  let date = new Date(row.date + 'T00:00:00');
  if (pick) date = new Date(pick[0], pick[1] - 1, pick[2], date.getHours(), date.getMinutes());
  return { ...row, date: oldFormatDate(date), updated_at: new Date(at).toISOString() };
}

// --- Cases -------------------------------------------------------------------
// `meant`: the day the user saw on screen when saving. `expect[zone]`: what
// migration 2 should do: 'none', 'fixed' (date becomes `meant`), or
// ['pending', reason, suggested day].

const CASES = [
  {
    name: 'daytime entry',
    row: oldAdd({ opened: local(2025, 6, 10, 14) }),
    meant: '2025-06-10',
    expect: { ist: 'none', ny: 'none', utc: 'none' },
  },
  {
    name: 'entered at 03:00 with the default day',
    row: oldAdd({ opened: local(2025, 6, 10, 3) }),
    meant: '2025-06-10',
    expect: { ist: 'fixed', ny: 'none', utc: 'none' },
  },
  {
    name: 'entered at 03:00, an earlier day picked',
    row: oldAdd({ opened: local(2025, 6, 10, 3), pick: [2025, 6, 5] }),
    meant: '2025-06-05',
    expect: { ist: 'fixed', ny: 'none', utc: 'none' },
  },
  {
    name: 'entered at 03:00 on the 1st: back into the previous month',
    row: oldAdd({ opened: local(2025, 7, 1, 3) }),
    meant: '2025-07-01',
    expect: { ist: 'fixed', ny: 'none', utc: 'none' },
  },
  {
    // The screen may have been opened before midnight: ambiguous.
    name: 'entered at 00:15',
    row: oldAdd({ opened: local(2025, 6, 10, 0, 10), openFor: 5 * MIN }),
    meant: '2025-06-10',
    expect: {
      ist: ['pending', 'add-uncertain', '2025-06-10'],
      ny: ['pending', 'add-uncertain', '2025-06-09'],
      utc: 'none',
    },
  },
  {
    // Looks like the one above, but the user saw the 9th: "keep" is right in India.
    name: 'opened at 23:55, saved at 00:05',
    row: oldAdd({ opened: local(2025, 6, 9, 23, 55), openFor: 10 * MIN }),
    meant: '2025-06-09',
    expect: {
      ist: ['pending', 'add-uncertain', '2025-06-10'],
      ny: ['pending', 'add-uncertain', '2025-06-09'],
      utc: 'none',
    },
  },
  {
    // Saved after the boundary, opened before it.
    name: 'opened at 05:20, saved at 05:45',
    row: oldAdd({ opened: local(2025, 6, 10, 5, 20), openFor: 25 * MIN }),
    meant: '2025-06-10',
    expect: { ist: ['pending', 'add-uncertain', '2025-06-10'], ny: 'none', utc: 'none' },
  },
  {
    name: 'entered at 21:00 with the default day',
    row: oldAdd({ opened: local(2025, 6, 10, 21) }),
    meant: '2025-06-10',
    expect: { ist: 'none', ny: 'fixed', utc: 'none' },
  },
  {
    name: 'entered at 21:30, an earlier day picked',
    row: oldAdd({ opened: local(2025, 6, 10, 21, 30), pick: [2025, 6, 1] }),
    meant: '2025-06-01',
    expect: { ist: 'none', ny: 'fixed', utc: 'none' },
  },
  {
    // New York: 19:30 on 9 March (EDT) is outside the shifted hours, but the
    // picked 1 March (EST) at 19:30 is inside them.
    name: 'picked across a DST change',
    row: oldAdd({ opened: local(2025, 3, 9, 19, 30), pick: [2025, 3, 1] }),
    meant: '2025-03-01',
    expect: { ist: 'none', ny: ['pending', 'add-uncertain', '2025-03-01'], utc: 'none' },
  },
  {
    name: 'edited once, day unchanged',
    row: oldEdit(oldAdd({ opened: local(2025, 6, 10, 14) }), { at: local(2025, 6, 12, 10) }),
    meant: '2025-06-10',
    expect: { ist: ['pending', 'edited', '2025-06-10'], ny: 'none', utc: 'none' },
  },
  {
    name: 'edited with a day picked',
    row: oldEdit(oldAdd({ opened: local(2025, 6, 10, 14) }), { at: local(2025, 6, 12, 10), pick: [2025, 6, 3] }),
    meant: '2025-06-03',
    expect: { ist: ['pending', 'edited', '2025-06-03'], ny: 'none', utc: 'none' },
  },
  {
    // Each save moved it back a day; only the last one can be undone.
    name: 'edited twice, day unchanged',
    row: oldEdit(oldEdit(oldAdd({ opened: local(2025, 6, 10, 14) }), { at: local(2025, 6, 11, 9) }), {
      at: local(2025, 6, 12, 9),
    }),
    meant: '2025-06-10',
    expect: { ist: ['pending', 'edited', '2025-06-09'], ny: 'none', utc: 'none' },
  },
  {
    // The add screen shifted it and the edit screen left it (New York).
    name: 'entered at 21:00, then edited',
    row: oldEdit(oldAdd({ opened: local(2025, 6, 10, 21) }), { at: local(2025, 6, 12, 10) }),
    meant: '2025-06-10',
    expect: {
      ist: ['pending', 'edited', '2025-06-10'],
      ny: ['pending', 'edited', '2025-06-10'],
      utc: 'none',
    },
  },
  {
    // A day after the save day: the add screen did not write it (an import).
    name: 'future day at a night time',
    row: (() => {
      const saved = new Date(local(2025, 6, 10, 3)).toISOString();
      return { date: '2025-06-20', created_at: saved, updated_at: saved };
    })(),
    meant: '2025-06-20',
    expect: { ist: 'none', ny: 'none', utc: 'none' },
  },
].map((c, i) => ({ ...c, id: i + 1 }));

// --- Databases ---------------------------------------------------------------

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

// The original schema (as in scripts/verify-migrations.mjs) with the cases.
function legacyDb() {
  const db = adapt(new DatabaseSync(':memory:'));
  db.execSync(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT, icon TEXT,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL, date TEXT NOT NULL,
      category_id INTEGER NOT NULL, location TEXT, description TEXT, metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id));
    INSERT INTO categories (name) VALUES ('Food & Dining');
  `);
  for (const c of CASES) {
    db.runSync(
      `INSERT INTO expenses (id, amount, date, category_id, description, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [c.id, c.id * 10, c.row.date, c.name, c.row.created_at, c.row.updated_at]
    );
  }
  return db;
}

const onlyVersion = (version) => MIGRATIONS.filter((m) => m.version <= version);
const dayOf = (db, id) => toDayKey(db.getFirstSync('SELECT date FROM expenses WHERE id = ?', [id]).date);
const reviewOf = (db, id) => db.getFirstSync('SELECT * FROM date_review WHERE expense_id = ?', [id]);
// Expense rows, without the two empty columns migration 3 (income and
// recurring) adds, so a database stopped at version 1 compares equal.
const snapshot = (db) =>
  db
    .getAllSync('SELECT * FROM expenses ORDER BY id')
    .map(({ recurring_rule_id, occurrence_date, ...row }) => row);

function checkCases(db, cases = CASES) {
  for (const c of cases) {
    const expect = c.expect[ZONE];
    const review = reviewOf(db, c.id);
    const label = `${c.name} (stored ${c.row.date})`;
    if (expect === 'none') {
      assert.equal(review, null, label);
      assert.equal(dayOf(db, c.id), c.row.date, label);
    } else if (expect === 'fixed') {
      assert.equal(dayOf(db, c.id), c.meant, label);
      assert.notEqual(c.row.date, c.meant, `${label}: the case should start shifted`);
      assert.equal(review.status, 'fixed', label);
      assert.equal(review.reason, 'add-shifted', label);
      assert.equal(toDayKey(review.original_date), c.row.date, label);
      assert.equal(toDayKey(review.suggested_date), c.meant, label);
    } else {
      const [status, reason, suggested] = expect;
      assert.equal(dayOf(db, c.id), c.row.date, `${label}: pending rows keep their day`);
      assert.equal(review?.status, status, label);
      assert.equal(review.reason, reason, label);
      assert.equal(toDayKey(review.suggested_date), suggested, label);
    }
  }
}

const count = (kind) => CASES.filter((c) => (kind === 'fixed' ? c.expect[ZONE] === 'fixed' : Array.isArray(c.expect[ZONE]))).length;

// --- Tests -------------------------------------------------------------------

test(`fixtures reproduce the old bug (TZ=${TZ})`, () => {
  const shifted = CASES.filter((c) => c.row.date !== c.meant).map((c) => c.name);
  const expected = {
    utc: [],
    ist: [
      'entered at 03:00 with the default day',
      'entered at 03:00, an earlier day picked',
      'entered at 03:00 on the 1st: back into the previous month',
      'entered at 00:15',
      'opened at 05:20, saved at 05:45',
      'edited once, day unchanged',
      'edited with a day picked',
      'edited twice, day unchanged',
      'entered at 21:00, then edited',
    ],
    ny: [
      'opened at 23:55, saved at 00:05',
      'entered at 21:00 with the default day',
      'entered at 21:30, an earlier day picked',
      'picked across a DST change',
      'entered at 21:00, then edited',
    ],
  }[ZONE];
  assert.deepEqual(shifted, expected);
});

test(`upgrade from the original schema: provable shifts fixed, doubtful ones listed (TZ=${TZ})`, () => {
  const db = legacyDb();
  assert.deepEqual(runMigrations(db), { fromVersion: 0, toVersion: MIGRATIONS.at(-1).version });
  checkCases(db);
  assert.deepEqual(getOpenDateReviewCount(db), { pending: count('pending'), fixed: count('fixed') });
  if (ZONE === 'utc') {
    assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM date_review').n, 0);
  }
  // Only `date` moved: amounts, ids, timestamps untouched.
  const viaMigration1 = legacyDb();
  runMigrations(viaMigration1, onlyVersion(1));
  const before = snapshot(viaMigration1);
  const after = snapshot(db);
  assert.deepEqual(after.map(({ date, ...rest }) => rest), before.map(({ date, ...rest }) => rest));
});

test(`migration 2 is idempotent (TZ=${TZ})`, () => {
  const db = legacyDb();
  runMigrations(db);
  const rows = snapshot(db);
  const reviews = db.getAllSync('SELECT * FROM date_review ORDER BY expense_id');
  db.execSync('PRAGMA user_version = 1'); // replays migration 2 (and the later ones)
  runMigrations(db);
  assert.deepEqual(snapshot(db), rows);
  assert.deepEqual(db.getAllSync('SELECT * FROM date_review ORDER BY expense_id'), reviews);
});

test(`upgrade from version 1: rows written after migration 1 are left alone (TZ=${TZ})`, () => {
  const db = legacyDb();
  runMigrations(db, onlyVersion(1));
  const migratedAt = local(2025, 7, 1, 12);
  // Written by the fixed app afterwards: a night entry for an earlier day, and an edit.
  const nightTime = ZONE === 'ny' ? local(2025, 7, 2, 21) : local(2025, 7, 2, 3);
  db.runSync(
    'INSERT INTO expenses (id, amount, date, category_id, created_at, updated_at) VALUES (100, 1, ?, 1, ?, ?)',
    [local(2025, 7, 1, 12), nightTime, nightTime]
  );
  db.runSync(
    'INSERT INTO expenses (id, amount, date, category_id, created_at, updated_at) VALUES (101, 1, ?, 1, ?, ?)',
    [local(2025, 7, 2, 12), local(2025, 7, 2, 14), local(2025, 7, 3, 9)]
  );
  // An old row the fixed app edited later is never fixed silently.
  const oldNight = CASES.find((c) => c.name === 'entered at 03:00 with the default day');
  db.runSync('UPDATE expenses SET updated_at = ? WHERE id = ?', [local(2025, 7, 5, 9), oldNight.id]);

  runMigrations(db, MIGRATIONS, { originalSchemaMigratedAt: () => migratedAt });
  assert.equal(reviewOf(db, 100), null);
  assert.equal(reviewOf(db, 101), null);
  assert.equal(dayOf(db, 100), '2025-07-01');
  assert.equal(dayOf(db, 101), '2025-07-02');
  const oldNightReview = reviewOf(db, oldNight.id);
  if (ZONE === 'ist') {
    assert.equal(oldNightReview.status, 'pending');
    assert.equal(oldNightReview.reason, 'edited');
    assert.equal(dayOf(db, oldNight.id), oldNight.row.date);
  } else {
    assert.equal(oldNightReview, null);
  }
  checkCases(db, CASES.filter((c) => c !== oldNight));
});

test(`upgrade from version 1 without a known conversion time changes nothing (TZ=${TZ})`, () => {
  const db = legacyDb();
  runMigrations(db, onlyVersion(1));
  const before = snapshot(db);
  runMigrations(db, MIGRATIONS, { originalSchemaMigratedAt: () => null });
  assert.equal(getUserVersion(db), MIGRATIONS.at(-1).version);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM date_review').n, 0);
});

test(`review choices: move, keep, undo; stale entries drop out (TZ=${TZ})`, () => {
  const db = legacyDb();
  runMigrations(db);
  const items = getDateReviewItems(db);
  assert.equal(items.length, count('pending') + count('fixed'));
  // Pending first, each joined with its expense and category.
  const firstFixed = items.findIndex((i) => i.status === 'fixed');
  if (firstFixed !== -1) assert.ok(items.slice(firstFixed).every((i) => i.status === 'fixed'));
  for (const item of items) assert.equal(item.category_name, 'Food & Dining');

  const now = local(2026, 1, 1, 12);
  const pending = items.filter((i) => i.status === 'pending');
  const fixed = items.filter((i) => i.status === 'fixed');
  if (pending.length >= 3) {
    const [move, keep, stale] = pending;
    resolveDateReview(db, move.id, 'move', now);
    assert.equal(dayOf(db, move.id), toDayKey(move.suggested_date));
    assert.equal(db.getFirstSync('SELECT updated_at FROM expenses WHERE id = ?', [move.id]).updated_at, now);
    assert.equal(reviewOf(db, move.id).status, 'moved');

    resolveDateReview(db, keep.id, 'keep', now);
    assert.equal(dayOf(db, keep.id), toDayKey(keep.date));
    assert.equal(reviewOf(db, keep.id).status, 'kept');

    // Changed on the edit screen since: no longer listed, and not movable.
    db.runSync('UPDATE expenses SET date = ? WHERE id = ?', [local(2025, 1, 1, 12), stale.id]);
    assert.throws(() => resolveDateReview(db, stale.id, 'move', now), /changed since/);
    assert.equal(dayOf(db, stale.id), '2025-01-01');
    assert.ok(!getDateReviewItems(db).some((i) => [move.id, keep.id, stale.id].includes(i.id)));
    assert.throws(() => resolveDateReview(db, move.id, 'move', now), /changed since/);
  }
  if (fixed.length > 0) {
    const [undo] = fixed;
    assert.throws(() => resolveDateReview(db, undo.id, 'move', now), /changed since/);
    resolveDateReview(db, undo.id, 'undo', now);
    assert.equal(dayOf(db, undo.id), toDayKey(undo.original_date));
    assert.equal(reviewOf(db, undo.id).status, 'undone');
  }
  // A deleted expense whose id is reused does not inherit its review.
  const last = getDateReviewItems(db)[0];
  if (last) {
    db.runSync('DELETE FROM expenses WHERE id = ?', [last.id]);
    db.runSync(
      'INSERT INTO expenses (id, amount, date, category_id, created_at, updated_at) VALUES (?, 1, ?, 1, ?, ?)',
      [last.id, last.original_date, now, now]
    );
    assert.ok(!getDateReviewItems(db).some((i) => i.id === last.id));
  }
  if (ZONE === 'utc') assert.deepEqual(getDateReviewItems(db), []);
});
