import type { CreateIncomeInput, Income, IncomeWithCategory, UpdateIncomeInput } from '../types';
import { getMonthRange } from '../date';
import { db } from './index';

// Income entries, the counterpart of lib/db/expenses.ts. Income has its own
// tables (see migration 3 in migrations.ts) so expense queries never need a
// filter; a net balance is income total minus expense total.

const PAGE_SIZE = 20;

export interface PaginatedIncomes {
  data: IncomeWithCategory[];
  hasMore: boolean;
  total: number;
}

const SELECT = `
  SELECT
    i.*,
    c.name as category_name,
    c.color as category_color
  FROM incomes i
  JOIN income_categories c ON i.category_id = c.id`;

export function getIncomesPaginated(limit: number = PAGE_SIZE, offset: number = 0): PaginatedIncomes {
  const data = db.getAllSync<IncomeWithCategory>(
    `${SELECT} ORDER BY i.date DESC, i.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const total = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM incomes')?.count ?? 0;
  return { data, hasMore: offset + data.length < total, total };
}

export function getIncomesByMonthPaginated(
  month: string,
  limit: number = PAGE_SIZE,
  offset: number = 0
): PaginatedIncomes {
  const { start, end } = getMonthRange(month);
  const data = db.getAllSync<IncomeWithCategory>(
    `${SELECT} WHERE i.date >= ? AND i.date < ? ORDER BY i.date DESC, i.created_at DESC LIMIT ? OFFSET ?`,
    [start, end, limit, offset]
  );
  const total =
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM incomes WHERE date >= ? AND date < ?', [
      start,
      end,
    ])?.count ?? 0;
  return { data, hasMore: offset + data.length < total, total };
}

export function getRecentIncomes(limit: number = 5): IncomeWithCategory[] {
  return db.getAllSync<IncomeWithCategory>(`${SELECT} ORDER BY i.date DESC, i.created_at DESC LIMIT ?`, [limit]);
}

export function getIncomeById(id: number): IncomeWithCategory | null {
  return db.getFirstSync<IncomeWithCategory>(`${SELECT} WHERE i.id = ?`, [id]);
}

export function createIncome(input: CreateIncomeInput): Income {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO incomes (amount, date, category_id, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.amount, input.date, input.category_id, input.description ?? null, input.metadata ?? null, now, now]
  );
  return db.getFirstSync<Income>('SELECT * FROM incomes WHERE id = ?', [result.lastInsertRowId])!;
}

export function updateIncome(id: number, input: UpdateIncomeInput): void {
  const updates: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [Date.now()];

  if (input.amount !== undefined) {
    updates.push('amount = ?');
    values.push(input.amount);
  }
  if (input.date !== undefined) {
    updates.push('date = ?');
    values.push(input.date);
  }
  if (input.category_id !== undefined) {
    updates.push('category_id = ?');
    values.push(input.category_id);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    values.push(input.description);
  }
  if (input.metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(input.metadata);
  }

  values.push(id);
  db.runSync(`UPDATE incomes SET ${updates.join(', ')} WHERE id = ?`, values);
}

export function deleteIncome(id: number): void {
  db.runSync('DELETE FROM incomes WHERE id = ?', [id]);
}

export function getMonthlyIncomeTotal(month: string): number {
  const { start, end } = getMonthRange(month);
  const result = db.getFirstSync<{ total: number | null }>(
    'SELECT SUM(amount) as total FROM incomes WHERE date >= ? AND date < ?',
    [start, end]
  );
  return result?.total ?? 0;
}
