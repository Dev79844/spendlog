import * as SQLite from 'expo-sqlite';
import { DEFAULT_CATEGORIES } from '../types';
import { runMigrations } from './migrations';

export const db = SQLite.openDatabaseSync('spendlog.db');

// Copies the database next to itself (the app's document directory, under
// SQLite/) before migrations touch it. VACUUM INTO writes a consistent copy,
// including anything still in the WAL. The file keeps the old schema version,
// so restoring it over spendlog.db makes the app migrate it again.
function backupDatabase(fromVersion: number): void {
  const dir = db.databasePath.replace(/\/[^/]*$/, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${dir}/spendlog-backup-v${fromVersion}-${stamp}.db`;
  db.runSync('VACUUM INTO ?', [path]);
  console.log(`Database backed up to ${path}`);
}

export async function initDatabase(): Promise<void> {
  const { fromVersion, toVersion } = runMigrations(db, undefined, { backup: backupDatabase });
  if (fromVersion !== toVersion) {
    console.log(`Database migrated from version ${fromVersion} to ${toVersion}`);
  }

  // Seed default categories if none exist
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM categories');

  if (result && result.count === 0) {
    const now = Date.now();
    for (const category of DEFAULT_CATEGORIES) {
      db.runSync(
        'INSERT INTO categories (name, color, icon, created_at) VALUES (?, ?, ?, ?)',
        [category.name, category.color ?? null, category.icon ?? null, now]
      );
    }
  }
}
