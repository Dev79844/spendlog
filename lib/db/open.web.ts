import * as SQLite from 'expo-sqlite';

// Web only (the web preview; see metro.config.js). expo-sqlite's web build
// runs SQLite in a worker, and a sync call made before that worker has started
// blocks the main thread the worker needs to start, then fails with "Sync
// operation timeout". So the database opens on first use after
// waitForDatabase(), which initDatabase() awaits, has started the worker.
let database: SQLite.SQLiteDatabase | null = null;
let ready = false;

export const db = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_target, property) {
    if (!database) {
      // Dev tools inspect exports (`$$typeof` and the like); don't open for those.
      if (!(property in SQLite.SQLiteDatabase.prototype)) return undefined;
      if (!ready) throw new Error(`db.${String(property)} used before initDatabase()`);
      database = SQLite.openDatabaseSync('spendlog.db');
    }
    const value = Reflect.get(database, property);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});

export async function waitForDatabase(): Promise<void> {
  const memory = await SQLite.openDatabaseAsync(':memory:');
  await memory.closeAsync();
  ready = true;
}
