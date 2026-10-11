import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { DEFAULT_CATEGORIES } from '../types';
import { runMigrations } from './migrations';

export const db = SQLite.openDatabaseSync('spendlog.db');

// Copies the database next to itself (the app's document directory, under
// SQLite/) before migrations touch it. VACUUM INTO writes a consistent copy,
// including anything still in the WAL. The file keeps the old schema version,
// so restoring it over spendlog.db makes the app migrate it again.
function backupDatabase(fromVersion: number): void {
  const dir = databaseDirectory();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${dir}/spendlog-backup-v${fromVersion}-${stamp}.db`;
  db.runSync('VACUUM INTO ?', [path]);
  console.log(`Database backed up to ${path}`);
}

function databaseDirectory(): string {
  return db.databasePath.replace(/\/[^/]*$/, '');
}

// When this database left the original schema: the time in the name of the
// newest version-0 backup that backupDatabase wrote. Null when there is none
// (an install that started on the new schema) or the folder can't be read.
function originalSchemaMigratedAt(): number | null {
  try {
    const dir = databaseDirectory();
    let latest: number | null = null;
    for (const entry of new Directory(dir.startsWith('file://') ? dir : `file://${dir}`).list()) {
      const m = /^spendlog-backup-v0-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.db$/.exec(entry.name);
      if (!m) continue;
      const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number);
      const time = Date.UTC(y, mo - 1, d, h, mi, s, ms);
      if (latest === null || time > latest) latest = time;
    }
    return latest;
  } catch (error) {
    console.warn('Could not list database backups', error);
    return null;
  }
}

export async function initDatabase(): Promise<void> {
  const { fromVersion, toVersion } = runMigrations(db, undefined, {
    backup: backupDatabase,
    originalSchemaMigratedAt,
  });
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
