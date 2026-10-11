import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('spendlog.db');

// Nothing to wait for on Android and iOS; see open.web.ts.
export async function waitForDatabase(): Promise<void> {}
