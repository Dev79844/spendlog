// Regenerates pre-migration-export.csv: PRE_MIGRATION_SQL exported by the
// CSV code of an app version from before the epoch-ms migration. The
// committed file was made from commit 4e53146 (PR #5, CSV export/import):
//
//   git worktree add /tmp/spendlog-pre 4e53146
//   TZ=UTC node scripts/fixtures/generate-pre-migration-export.mjs /tmp/spendlog-pre
//   git worktree remove /tmp/spendlog-pre
//
// It should never need regenerating: the point is a file the old app wrote.

import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { PRE_MIGRATION_SQL } from './pre-migration-db.mjs';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node scripts/fixtures/generate-pre-migration-export.mjs <pre-migration checkout>');
  process.exit(1);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { buildCsvExport } = await import(pathToFileURL(resolve(root, 'lib/db/csv.ts')).href);

const raw = new DatabaseSync(':memory:');
raw.exec(PRE_MIGRATION_SQL);
const db = {
  getAllSync: (sql, params) => raw.prepare(sql).all(...params),
  getFirstSync: (sql, params) => raw.prepare(sql).get(...params) ?? null,
  runSync: (sql, params) => raw.prepare(sql).run(...params),
  withTransactionSync: (task) => task(),
};

const out = join(import.meta.dirname, 'pre-migration-export.csv');
writeFileSync(out, buildCsvExport(db).csv);
console.log(`wrote ${out}`);
