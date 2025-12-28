import type {
  CategorySummary,
  CreateExpenseInput,
  Expense,
  ExpenseWithCategory,
  MonthlySummary,
  UpdateExpenseInput,
} from '../types';
import { db, getCurrentTimestamp } from './index';

const PAGE_SIZE = 20;

export interface PaginatedExpenses {
  data: ExpenseWithCategory[];
  hasMore: boolean;
  total: number;
}

export function getAllExpenses(): ExpenseWithCategory[] {
  return db.getAllSync<ExpenseWithCategory>(`
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    ORDER BY e.date DESC, e.created_at DESC
  `);
}

export function getExpensesPaginated(
  limit: number = PAGE_SIZE,
  offset: number = 0
): PaginatedExpenses {
  const data = db.getAllSync<ExpenseWithCategory>(
    `
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [limit, offset]
  );

  const countResult = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses'
  );
  const total = countResult?.count ?? 0;

  return {
    data,
    hasMore: offset + data.length < total,
    total,
  };
}

export function getExpensesByMonth(month: string): ExpenseWithCategory[] {
  return db.getAllSync<ExpenseWithCategory>(
    `
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    WHERE e.date LIKE ?
    ORDER BY e.date DESC, e.created_at DESC
  `,
    [`${month}%`]
  );
}

export function getExpensesByMonthPaginated(
  month: string,
  limit: number = PAGE_SIZE,
  offset: number = 0
): PaginatedExpenses {
  const data = db.getAllSync<ExpenseWithCategory>(
    `
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    WHERE e.date LIKE ?
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [`${month}%`, limit, offset]
  );

  const countResult = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses WHERE date LIKE ?',
    [`${month}%`]
  );
  const total = countResult?.count ?? 0;

  return {
    data,
    hasMore: offset + data.length < total,
    total,
  };
}

export function getRecentExpenses(limit: number = 5): ExpenseWithCategory[] {
  return db.getAllSync<ExpenseWithCategory>(
    `
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ?
  `,
    [limit]
  );
}

export function getExpenseById(id: number): ExpenseWithCategory | null {
  return db.getFirstSync<ExpenseWithCategory>(
    `
    SELECT 
      e.*,
      c.name as category_name,
      c.color as category_color
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `,
    [id]
  );
}

export function createExpense(input: CreateExpenseInput): Expense {
  const now = getCurrentTimestamp();
  const result = db.runSync(
    `INSERT INTO expenses (amount, date, category_id, location, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.amount,
      input.date,
      input.category_id,
      input.location ?? null,
      input.description ?? null,
      input.metadata ?? null,
      now,
      now,
    ]
  );

  return db.getFirstSync<Expense>('SELECT * FROM expenses WHERE id = ?', [result.lastInsertRowId])!;
}

export function updateExpense(id: number, input: UpdateExpenseInput): void {
  const updates: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [getCurrentTimestamp()];

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
  if (input.location !== undefined) {
    updates.push('location = ?');
    values.push(input.location);
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
  db.runSync(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, values);
}

export function deleteExpense(id: number): void {
  db.runSync('DELETE FROM expenses WHERE id = ?', [id]);
}

export function getMonthlyTotal(month: string): number {
  const result = db.getFirstSync<{ total: number | null }>(
    'SELECT SUM(amount) as total FROM expenses WHERE date LIKE ?',
    [`${month}%`]
  );
  return result?.total ?? 0;
}

export function getMonthlySummary(month: string): MonthlySummary {
  const total = getMonthlyTotal(month);

  const categories = db.getAllSync<CategorySummary>(
    `
    SELECT 
      c.id as category_id,
      c.name as category_name,
      c.color as category_color,
      COALESCE(SUM(e.amount), 0) as total,
      CASE WHEN ? > 0 THEN ROUND(COALESCE(SUM(e.amount), 0) * 100.0 / ?, 1) ELSE 0 END as percentage
    FROM categories c
    LEFT JOIN expenses e ON c.id = e.category_id AND e.date LIKE ?
    WHERE c.is_active = 1
    GROUP BY c.id
    HAVING total > 0
    ORDER BY total DESC
  `,
    [total, total, `${month}%`]
  );

  const countResult = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses WHERE date LIKE ?',
    [`${month}%`]
  );

  return {
    total,
    categories,
    expenseCount: countResult?.count ?? 0,
  };
}
