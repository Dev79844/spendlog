import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types';
import { db } from './index';

export function getAllCategories(): Category[] {
  return db.getAllSync<Category>('SELECT * FROM categories WHERE is_active = 1 ORDER BY name');
}

export function getCategoryById(id: number): Category | null {
  return db.getFirstSync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
}

export function createCategory(input: CreateCategoryInput): Category {
  const result = db.runSync(
    'INSERT INTO categories (name, color, icon, created_at) VALUES (?, ?, ?, ?)',
    [input.name, input.color ?? null, input.icon ?? null, Date.now()]
  );
  
  return db.getFirstSync<Category>('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowId])!;
}

export function updateCategory(id: number, input: UpdateCategoryInput): void {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.color !== undefined) {
    updates.push('color = ?');
    values.push(input.color);
  }
  if (input.icon !== undefined) {
    updates.push('icon = ?');
    values.push(input.icon);
  }
  if (input.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(input.is_active);
  }

  if (updates.length === 0) return;

  values.push(id);
  db.runSync(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
}

export function deleteCategory(id: number): void {
  // Soft delete by setting is_active = 0
  db.runSync('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
}

export function hardDeleteCategory(id: number): void {
  // Check if any expenses use this category
  const expenseCount = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses WHERE category_id = ?',
    [id]
  );
  
  if (expenseCount && expenseCount.count > 0) {
    throw new Error(`Cannot delete category: ${expenseCount.count} expenses are using it`);
  }
  
  db.runSync('DELETE FROM categories WHERE id = ?', [id]);
}

export function getCategoryExpenseCount(id: number): number {
  const result = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses WHERE category_id = ?',
    [id]
  );
  return result?.count ?? 0;
}
