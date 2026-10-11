import { toExpenseDay } from '../date';
import { occurrencesBetween, today } from '../recurrence';
import type { RecurringRule, RecurringRuleInput, RecurringRuleWithCategory } from '../types';

// Recurring rules and their catch-up. Like lib/db/csv.ts, these take the
// database as a parameter (screens and stores pass `db` from './index') so
// scripts/test-recurring.mjs can run them under Node against node:sqlite.
//
// There are no background jobs: the app calls `materializeDueOccurrences` on
// start and whenever it returns to the foreground. For each active rule it
// inserts every occurrence after the rule's `last_occurrence` cursor up to
// today, as ordinary expense/income rows carrying (recurring_rule_id,
// occurrence_date). That pair has a unique index, and the inserts and the
// cursor move happen in one transaction, so a second run, a crash half-way or
// two runs racing never produce a duplicate. Because the cursor moves past
// generated days, deleting a generated row does not bring it back.

type BindValue = string | number | null;

export interface RecurringDatabase {
  getAllSync<T>(source: string, params: BindValue[]): T[];
  getFirstSync<T>(source: string, params: BindValue[]): T | null;
  runSync(source: string, params: BindValue[]): unknown;
  withTransactionSync(task: () => void): void;
}

const changes = (result: unknown) => Number((result as { changes?: number | bigint }).changes ?? 0);

const RULE_SELECT = `
  SELECT
    r.*,
    CASE r.kind WHEN 'income' THEN ic.name ELSE c.name END AS category_name,
    CASE r.kind WHEN 'income' THEN ic.color ELSE c.color END AS category_color
  FROM recurring_rules r
  LEFT JOIN categories c ON r.kind = 'expense' AND c.id = r.category_id
  LEFT JOIN income_categories ic ON r.kind = 'income' AND ic.id = r.category_id`;

export function getRecurringRules(db: RecurringDatabase): RecurringRuleWithCategory[] {
  return db.getAllSync<RecurringRuleWithCategory>(
    `${RULE_SELECT} ORDER BY r.is_active DESC, r.kind, r.start_date, r.id`,
    []
  );
}

export function getRecurringRuleById(db: RecurringDatabase, id: number): RecurringRuleWithCategory | null {
  return db.getFirstSync<RecurringRuleWithCategory>(`${RULE_SELECT} WHERE r.id = ?`, [id]);
}

export function createRecurringRule(db: RecurringDatabase, input: RecurringRuleInput): RecurringRule {
  const now = Date.now();
  db.runSync(
    `INSERT INTO recurring_rules
       (kind, amount, category_id, location, description, frequency, interval, start_date, end_date,
        is_active, last_occurrence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
    [
      input.kind,
      input.amount,
      input.category_id,
      input.kind === 'expense' ? input.location : null,
      input.description,
      input.frequency,
      input.interval,
      input.start_date,
      input.end_date,
      now,
      now,
    ]
  );
  return db.getFirstSync<RecurringRule>('SELECT * FROM recurring_rules WHERE id = last_insert_rowid()', [])!;
}

/**
 * Changes a rule. Rows already generated are left as they are, and the cursor
 * stays: a changed schedule only affects occurrences after the last one
 * generated. The kind cannot change (category ids belong to one table).
 */
export function updateRecurringRule(db: RecurringDatabase, id: number, input: RecurringRuleInput): void {
  db.runSync(
    `UPDATE recurring_rules SET
       amount = ?, category_id = ?, location = ?, description = ?, frequency = ?, interval = ?,
       start_date = ?, end_date = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.amount,
      input.category_id,
      input.kind === 'expense' ? input.location : null,
      input.description,
      input.frequency,
      input.interval,
      input.start_date,
      input.end_date,
      Date.now(),
      id,
    ]
  );
}

/**
 * Pauses or resumes a rule. Resuming does not back-fill the days it was
 * paused: the cursor moves to yesterday, so the next occurrence from today
 * on is generated.
 */
export function setRecurringRuleActive(
  db: RecurringDatabase,
  id: number,
  active: boolean,
  now: Date = new Date()
): void {
  if (!active) {
    db.runSync('UPDATE recurring_rules SET is_active = 0, updated_at = ? WHERE id = ?', [Date.now(), id]);
    return;
  }
  const yesterday = toExpenseDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  db.runSync(
    `UPDATE recurring_rules
     SET is_active = 1, updated_at = ?, last_occurrence = MAX(COALESCE(last_occurrence, ?), ?)
     WHERE id = ? AND is_active = 0`,
    [Date.now(), yesterday, yesterday, id]
  );
}

/** Deletes a rule. Rows it generated stay, as ordinary unlinked rows. */
export function deleteRecurringRule(db: RecurringDatabase, id: number): void {
  db.withTransactionSync(() => {
    for (const table of ['expenses', 'incomes']) {
      db.runSync(
        `UPDATE ${table} SET recurring_rule_id = NULL, occurrence_date = NULL WHERE recurring_rule_id = ?`,
        [id]
      );
    }
    db.runSync('DELETE FROM recurring_rules WHERE id = ?', [id]);
  });
}

/** Number of rules (active or paused) that use a category. */
export function getCategoryRuleCount(db: RecurringDatabase, categoryId: number, kind: 'expense' | 'income'): number {
  return (
    db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM recurring_rules WHERE kind = ? AND category_id = ?', [
      kind,
      categoryId,
    ])?.n ?? 0
  );
}

/**
 * Generates every due occurrence of every active rule, up to and including
 * today (local). Safe to call any number of times. Returns the number of rows
 * inserted.
 */
export function materializeDueOccurrences(db: RecurringDatabase, now: Date = new Date()): number {
  const until = today(now);
  const rules = db.getAllSync<RecurringRule>('SELECT * FROM recurring_rules WHERE is_active = 1 ORDER BY id', []);
  let inserted = 0;

  for (const rule of rules) {
    const days = occurrencesBetween(rule, rule.last_occurrence, until);
    if (days.length === 0) continue;
    const created = Date.now();

    db.withTransactionSync(() => {
      for (const day of days) {
        const result =
          rule.kind === 'income'
            ? db.runSync(
                `INSERT INTO incomes
                   (amount, date, category_id, description, recurring_rule_id, occurrence_date, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (recurring_rule_id, occurrence_date) DO NOTHING`,
                [rule.amount, day, rule.category_id, rule.description, rule.id, day, created, created]
              )
            : db.runSync(
                `INSERT INTO expenses
                   (amount, date, category_id, location, description, recurring_rule_id, occurrence_date,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (recurring_rule_id, occurrence_date) DO NOTHING`,
                [rule.amount, day, rule.category_id, rule.location, rule.description, rule.id, day, created, created]
              );
        inserted += changes(result);
      }
      // MAX: never move the cursor backwards if another run got further.
      db.runSync(
        'UPDATE recurring_rules SET last_occurrence = MAX(COALESCE(last_occurrence, ?), ?) WHERE id = ?',
        [days[days.length - 1], days[days.length - 1], rule.id]
      );
    });
  }
  return inserted;
}
