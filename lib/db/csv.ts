import {
  buildExportCsv,
  expenseDuplicateKey,
  type CsvExportCategory,
  type CsvExportExpense,
  type CsvImportCategory,
  type CsvImportExpense,
  type CsvImportResult,
} from '../csv';
import type { Category } from '../types';

// These functions take the database as a parameter instead of importing `db`
// from './index' (which loads expo-sqlite), so scripts/test-csv.mjs can run
// them under Node against node:sqlite. Screens pass `db` from '@/lib/db'.

type BindValue = string | number | null;

export interface CsvDatabase {
  getAllSync<T>(source: string, params: BindValue[]): T[];
  getFirstSync<T>(source: string, params: BindValue[]): T | null;
  runSync(source: string, params: BindValue[]): unknown;
  withTransactionSync(task: () => void): void;
}

/** Category name → row, case-insensitive; the oldest category wins a clash. */
function categoriesByName(db: CsvDatabase): Map<string, Category> {
  const map = new Map<string, Category>();
  for (const c of db.getAllSync<Category>('SELECT * FROM categories ORDER BY id', [])) {
    const key = categoryKey(c.name);
    if (!map.has(key)) map.set(key, c);
  }
  return map;
}

function categoryKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface CsvExport {
  csv: string;
  expenseCount: number;
  categoryCount: number;
}

/** All expenses (every month, every category including inactive) and all categories. */
export function buildCsvExport(db: CsvDatabase): CsvExport {
  const expenses = db.getAllSync<CsvExportExpense>(`
    SELECT
      e.id, e.date, e.amount,
      COALESCE(c.name, 'Uncategorized') as category,
      c.color as category_color,
      c.icon as category_icon,
      e.location, e.description, e.metadata, e.created_at, e.updated_at
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    ORDER BY e.date, e.id
  `, []);
  const categories = db.getAllSync<CsvExportCategory>(
    'SELECT name, color, icon, is_active, created_at FROM categories ORDER BY id',
    []
  );
  return {
    csv: buildExportCsv(expenses, categories),
    expenseCount: expenses.length,
    categoryCount: categories.length,
  };
}

interface NewCategory {
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: string | null;
}

interface CategoryUpdate {
  id: number;
  name: string;
  color?: string;
  icon?: string;
  is_active?: number;
}

export interface CsvImportPlan {
  /** Expense rows that will be inserted. */
  expenses: CsvImportExpense[];
  /** Rows skipped because the same expense already exists. */
  duplicates: number;
  newCategories: NewCategory[];
  /**
   * Existing categories whose color/icon/active state will be set from the
   * file. Only when the database has no expenses yet (a restore into a fresh
   * install); otherwise existing categories are never changed.
   */
  categoryUpdates: CategoryUpdate[];
}

/**
 * Decides what an import would do, without writing anything. Categories are
 * matched by name, case-insensitively. Expenses already in the database (same
 * date, amount, category and description) are skipped, counted per
 * occurrence, so re-importing the app's own export adds nothing while genuine
 * repeats inside one file are kept.
 */
export function planCsvImport(db: CsvDatabase, parsed: CsvImportResult): CsvImportPlan {
  const byName = categoriesByName(db);

  // The file's view of each category: its category row if present, otherwise
  // the color/icon of the first expense row that names it.
  const fromFile = new Map<string, CsvImportCategory>();
  for (const c of parsed.categories) fromFile.set(categoryKey(c.name), c);
  for (const e of parsed.expenses) {
    const key = categoryKey(e.category);
    if (!fromFile.has(key)) {
      fromFile.set(key, {
        row: e.row,
        name: e.category.trim(),
        color: e.category_color,
        icon: e.category_icon,
        is_active: 1,
        created_at: null,
      });
    }
  }
  const fileCategoryRows = new Set(parsed.categories.map((c) => categoryKey(c.name)));

  const existingExpenseCount =
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM expenses', [])?.count ?? 0;

  const newCategories: NewCategory[] = [];
  const categoryUpdates: CategoryUpdate[] = [];
  for (const [key, c] of fromFile) {
    const match = byName.get(key);
    if (!match) {
      newCategories.push({
        name: c.name.trim(),
        color: c.color,
        icon: c.icon,
        is_active: c.is_active,
        created_at: c.created_at,
      });
      continue;
    }
    if (existingExpenseCount > 0) continue;
    const update: CategoryUpdate = { id: match.id, name: match.name };
    if (c.color && c.color !== match.color) update.color = c.color;
    if (c.icon && c.icon !== match.icon) update.icon = c.icon;
    if (fileCategoryRows.has(key) && c.is_active !== match.is_active) {
      update.is_active = c.is_active;
    }
    if (Object.keys(update).length > 2) categoryUpdates.push(update);
  }

  const remaining = new Map<string, number>();
  const rows = db.getAllSync<{ date: string; amount: number; category: string; description: string | null }>(`
    SELECT e.date, e.amount, COALESCE(c.name, 'Uncategorized') as category, e.description
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
  `, []);
  for (const r of rows) {
    const key = expenseDuplicateKey(r);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const expenses: CsvImportExpense[] = [];
  let duplicates = 0;
  for (const e of parsed.expenses) {
    const key = expenseDuplicateKey(e);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      duplicates++;
    } else {
      expenses.push(e);
    }
  }

  return { expenses, duplicates, newCategories, categoryUpdates };
}

/**
 * Applies a plan in one transaction: any failure rolls everything back.
 * Never deletes anything. An expense keeps its id from the file when that id
 * is free, so restoring into a fresh install reproduces the same ids.
 */
export function applyCsvImport(db: CsvDatabase, plan: CsvImportPlan): void {
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    for (const c of plan.newCategories) {
      db.runSync(
        'INSERT INTO categories (name, color, icon, is_active, created_at) VALUES (?, ?, ?, ?, ?)',
        [c.name, c.color, c.icon, c.is_active, c.created_at ?? now]
      );
    }
    for (const u of plan.categoryUpdates) {
      const updates: string[] = [];
      const values: (string | number)[] = [];
      if (u.color !== undefined) {
        updates.push('color = ?');
        values.push(u.color);
      }
      if (u.icon !== undefined) {
        updates.push('icon = ?');
        values.push(u.icon);
      }
      if (u.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(u.is_active);
      }
      values.push(u.id);
      db.runSync(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const categories = categoriesByName(db);
    for (const e of plan.expenses) {
      const categoryId = categories.get(categoryKey(e.category))?.id;
      if (categoryId === undefined) {
        throw new Error(`Row ${e.row}: category "${e.category}" was not created`);
      }
      const idFree =
        e.id !== null && !db.getFirstSync('SELECT 1 FROM expenses WHERE id = ?', [e.id]);
      db.runSync(
        `INSERT INTO expenses (id, amount, date, category_id, location, description, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idFree ? e.id : null,
          e.amount,
          e.date,
          categoryId,
          e.location,
          e.description,
          e.metadata,
          e.created_at ?? now,
          e.updated_at ?? e.created_at ?? now,
        ]
      );
    }
  });
}
