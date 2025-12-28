import * as SQLite from 'expo-sqlite';
import { DEFAULT_CATEGORIES } from '../types';

export const db = SQLite.openDatabaseSync('spendlog.db');

export async function initDatabase(): Promise<void> {
  // Create tables
  await db.execAsync(`
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
  `);

  // Seed default categories if none exist
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  
  if (result && result.count === 0) {
    for (const category of DEFAULT_CATEGORIES) {
      db.runSync(
        'INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)',
        [category.name, category.color ?? null, category.icon ?? null]
      );
    }
  }
}

// Helper to get current timestamp in ISO format
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// Helper to format date as YYYY-MM-DD
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper to get current month in YYYY-MM format
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
