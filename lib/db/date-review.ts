import type { DateReviewItem } from '../types';

// The Review dates screen's queries over date_review (written by migration 2).
// Like lib/db/csv.ts these take the database as a parameter so Node can run
// them against node:sqlite; screens pass `db` from '@/lib/db'.

type BindValue = string | number | null;

export interface DateReviewDatabase {
  getAllSync<T>(source: string, params: BindValue[]): T[];
  getFirstSync<T>(source: string, params: BindValue[]): T | null;
  runSync(source: string, params: BindValue[]): unknown;
  withTransactionSync(task: () => void): void;
}

export type DateReviewChoice = 'move' | 'keep' | 'undo';

// Entries still open: pending ones whose day is unchanged since the
// migration, and automatic fixes nobody has changed since (they can be
// undone). Anything edited, deleted or resolved in the meantime drops out.
const OPEN_ITEMS = `
  SELECT
    e.*,
    c.name AS category_name,
    c.color AS category_color,
    r.reason,
    r.status,
    r.original_date,
    r.suggested_date
  FROM date_review r
  JOIN expenses e ON e.id = r.expense_id AND e.created_at = r.expense_created_at
  JOIN categories c ON c.id = e.category_id
  WHERE ((r.status = 'pending' AND e.date = r.original_date)
     OR (r.status = 'fixed' AND e.date = r.suggested_date))`;

export function getDateReviewItems(db: DateReviewDatabase): DateReviewItem[] {
  return db.getAllSync<DateReviewItem>(
    `${OPEN_ITEMS} ORDER BY r.status = 'fixed', e.date DESC, e.id DESC`,
    []
  );
}

export function getOpenDateReviewCount(db: DateReviewDatabase): { pending: number; fixed: number } {
  const rows = db.getAllSync<{ status: 'pending' | 'fixed'; n: number }>(
    `SELECT status, COUNT(*) AS n FROM (${OPEN_ITEMS}) GROUP BY status`,
    []
  );
  return {
    pending: rows.find((r) => r.status === 'pending')?.n ?? 0,
    fixed: rows.find((r) => r.status === 'fixed')?.n ?? 0,
  };
}

// 'move' sets a pending expense to the suggested day, 'keep' leaves it as it
// is, 'undo' puts an automatic fix back to the original day. Throws, changing
// nothing, if the entry is no longer open for that choice.
export function resolveDateReview(
  db: DateReviewDatabase,
  expenseId: number,
  choice: DateReviewChoice,
  now: number = Date.now()
): void {
  db.withTransactionSync(() => {
    const item = db.getFirstSync<DateReviewItem>(`${OPEN_ITEMS} AND r.expense_id = ?`, [expenseId]);
    const expected = choice === 'undo' ? 'fixed' : 'pending';
    if (!item || item.status !== expected) {
      throw new Error('This expense has changed since it was listed. Nothing was changed.');
    }
    if (choice !== 'keep') {
      const date = choice === 'move' ? item.suggested_date : item.original_date;
      db.runSync('UPDATE expenses SET date = ?, updated_at = ? WHERE id = ?', [date, now, expenseId]);
    }
    const status = choice === 'move' ? 'moved' : choice === 'keep' ? 'kept' : 'undone';
    db.runSync('UPDATE date_review SET status = ?, resolved_at = ? WHERE expense_id = ?', [
      status,
      now,
      expenseId,
    ]);
  });
}
