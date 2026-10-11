import {
  buildExportCsv,
  expenseDuplicateKey,
  ruleDuplicateKey,
  type CsvExportCategory,
  type CsvExportExpense,
  type CsvExportRule,
  type CsvImportCategory,
  type CsvImportExpense,
  type CsvImportResult,
  type CsvImportRule,
} from '../csv';
import type { Category, Frequency, TransactionKind } from '../types';

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

const KINDS: TransactionKind[] = ['expense', 'income'];

// The transaction and category tables of each kind.
const TABLES: Record<TransactionKind, { rows: string; categories: string }> = {
  expense: { rows: 'expenses', categories: 'categories' },
  income: { rows: 'incomes', categories: 'income_categories' },
};

/** Category name → row, case-insensitive; the oldest category wins a clash. */
function categoriesByName(db: CsvDatabase, kind: TransactionKind): Map<string, Category> {
  const map = new Map<string, Category>();
  for (const c of db.getAllSync<Category>(`SELECT * FROM ${TABLES[kind].categories} ORDER BY id`, [])) {
    const key = categoryKey(c.name);
    if (!map.has(key)) map.set(key, c);
  }
  return map;
}

function categoryKey(name: string): string {
  return name.trim().toLowerCase();
}

const ruleRef = (kind: TransactionKind, fileId: number) => `${kind}:${fileId}`;

export interface CsvExport {
  csv: string;
  expenseCount: number;
  incomeCount: number;
  ruleCount: number;
  categoryCount: number; // expense and income categories
}

function exportRows(db: CsvDatabase, kind: TransactionKind): CsvExportExpense[] {
  const { rows, categories } = TABLES[kind];
  return db.getAllSync<CsvExportExpense>(`
    SELECT
      e.id, e.date, e.amount,
      COALESCE(c.name, 'Uncategorized') as category,
      c.color as category_color,
      c.icon as category_icon,
      ${kind === 'expense' ? 'e.location' : 'NULL as location'},
      e.description, e.metadata, e.recurring_rule_id, e.occurrence_date, e.created_at, e.updated_at
    FROM ${rows} e
    LEFT JOIN ${categories} c ON e.category_id = c.id
    ORDER BY e.date, e.id
  `, []);
}

function exportCategories(db: CsvDatabase, kind: TransactionKind): CsvExportCategory[] {
  return db.getAllSync<CsvExportCategory>(
    `SELECT name, color, icon, is_active, created_at FROM ${TABLES[kind].categories} ORDER BY id`,
    []
  );
}

/**
 * Everything: all expenses and income (every month, every category including
 * inactive), all categories of both kinds, and all recurring rules.
 */
export function buildCsvExport(db: CsvDatabase): CsvExport {
  const expenses = exportRows(db, 'expense');
  const incomes = exportRows(db, 'income');
  const categories = exportCategories(db, 'expense');
  const incomeCategories = exportCategories(db, 'income');
  const rules = db.getAllSync<CsvExportRule>(`
    SELECT
      r.id, r.kind, r.amount,
      COALESCE(CASE r.kind WHEN 'income' THEN ic.name ELSE c.name END, 'Uncategorized') as category,
      CASE r.kind WHEN 'income' THEN ic.color ELSE c.color END as category_color,
      CASE r.kind WHEN 'income' THEN ic.icon ELSE c.icon END as category_icon,
      r.location, r.description, r.frequency, r.interval, r.start_date, r.end_date, r.is_active,
      r.last_occurrence, r.created_at, r.updated_at
    FROM recurring_rules r
    LEFT JOIN categories c ON r.kind = 'expense' AND c.id = r.category_id
    LEFT JOIN income_categories ic ON r.kind = 'income' AND ic.id = r.category_id
    ORDER BY r.id
  `, []);
  return {
    csv: buildExportCsv({ expenses, incomes, categories, incomeCategories, rules }),
    expenseCount: expenses.length,
    incomeCount: incomes.length,
    ruleCount: rules.length,
    categoryCount: categories.length + incomeCategories.length,
  };
}

interface NewCategory {
  kind: TransactionKind;
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number;
  created_at: number | null;
}

interface CategoryUpdate {
  kind: TransactionKind;
  id: number;
  name: string;
  color?: string;
  icon?: string;
  is_active?: number;
}

export interface CsvImportPlan {
  /** Expense rows that will be inserted. */
  expenses: CsvImportExpense[];
  /** Income rows that will be inserted. */
  incomes: CsvImportExpense[];
  /** Recurring rules that will be inserted. */
  rules: CsvImportRule[];
  /** Expense rows skipped because the same expense already exists. */
  duplicates: number;
  incomeDuplicates: number;
  ruleDuplicates: number;
  newCategories: NewCategory[];
  /**
   * Existing categories whose color/icon/active state will be set from the
   * file. Only when the database has no rows of that kind yet (a restore into
   * a fresh install); otherwise existing categories are never changed.
   */
  categoryUpdates: CategoryUpdate[];
  /** `kind:fileRuleId` → id of the same rule already in the database. */
  matchedRules: Record<string, number>;
}

/** Occurrence counts of the duplicate keys already in the database. */
function existingKeys(db: CsvDatabase, kind: TransactionKind): Map<string, number> {
  const { rows: table, categories } = TABLES[kind];
  const counts = new Map<string, number>();
  const rows = db.getAllSync<{ date: number; amount: number; category: string; description: string | null }>(`
    SELECT e.date, e.amount, COALESCE(c.name, 'Uncategorized') as category, e.description
    FROM ${table} e
    LEFT JOIN ${categories} c ON e.category_id = c.id
  `, []);
  for (const r of rows) {
    const key = expenseDuplicateKey(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Takes one match for `key` from `remaining`; true when there was one. */
function takeMatch<T>(remaining: Map<string, T[]>, key: string): T | undefined {
  const list = remaining.get(key);
  return list && list.length > 0 ? list.shift() : undefined;
}

/**
 * Decides what an import would do, without writing anything. Categories are
 * matched by name, case-insensitively, within their kind (expense categories
 * and income categories are separate). Rows already in the database (same
 * date, amount, category and description) are skipped, counted per
 * occurrence, so re-importing the app's own export adds nothing while genuine
 * repeats inside one file are kept. Recurring rules already in the database
 * (same kind, start, amount, category, description and schedule) are skipped
 * too, and the file's rows generated by them are linked to the existing rule;
 * such a row is also skipped when that rule already has a row for the same
 * occurrence.
 */
export function planCsvImport(db: CsvDatabase, parsed: CsvImportResult): CsvImportPlan {
  const plan: CsvImportPlan = {
    expenses: [],
    incomes: [],
    rules: [],
    duplicates: 0,
    incomeDuplicates: 0,
    ruleDuplicates: 0,
    newCategories: [],
    categoryUpdates: [],
    matchedRules: {},
  };

  for (const kind of KINDS) {
    const byName = categoriesByName(db, kind);
    const transactions = kind === 'income' ? parsed.incomes : parsed.expenses;
    const rules = parsed.rules.filter((r) => r.kind === kind);
    const categoryRows = parsed.categories.filter((c) => c.kind === kind);

    // The file's view of each category: its category row if present, otherwise
    // the color/icon of the first transaction or rule row that names it.
    const fromFile = new Map<string, CsvImportCategory>();
    for (const c of categoryRows) fromFile.set(categoryKey(c.name), c);
    for (const e of [...transactions, ...rules]) {
      const key = categoryKey(e.category);
      if (!fromFile.has(key)) {
        fromFile.set(key, {
          row: e.row,
          kind,
          name: e.category.trim(),
          color: e.category_color,
          icon: e.category_icon,
          is_active: 1,
          created_at: null,
        });
      }
    }
    const fileCategoryRows = new Set(categoryRows.map((c) => categoryKey(c.name)));

    const existingCount =
      db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES[kind].rows}`, [])?.count ?? 0;

    for (const [key, c] of fromFile) {
      const match = byName.get(key);
      if (!match) {
        plan.newCategories.push({
          kind,
          name: c.name.trim(),
          color: c.color,
          icon: c.icon,
          is_active: c.is_active,
          created_at: c.created_at,
        });
        continue;
      }
      if (existingCount > 0) continue;
      const update: CategoryUpdate = { kind, id: match.id, name: match.name };
      if (c.color && c.color !== match.color) update.color = c.color;
      if (c.icon && c.icon !== match.icon) update.icon = c.icon;
      if (fileCategoryRows.has(key) && c.is_active !== match.is_active) {
        update.is_active = c.is_active;
      }
      if (Object.keys(update).length > 3) plan.categoryUpdates.push(update);
    }

    // Rules already in the database.
    const existingRules = new Map<string, number[]>();
    const ruleRows = db.getAllSync<{
      id: number;
      kind: TransactionKind;
      start_date: number;
      amount: number;
      category: string;
      description: string | null;
      frequency: Frequency;
      interval: number;
    }>(`
      SELECT r.id, r.kind, r.start_date, r.amount, COALESCE(c.name, 'Uncategorized') as category,
             r.description, r.frequency, r.interval
      FROM recurring_rules r
      LEFT JOIN ${TABLES[kind].categories} c ON c.id = r.category_id
      WHERE r.kind = ?
      ORDER BY r.id
    `, [kind]);
    for (const r of ruleRows) {
      const key = ruleDuplicateKey(r);
      existingRules.set(key, [...(existingRules.get(key) ?? []), r.id]);
    }
    for (const r of rules) {
      const existingId = takeMatch(existingRules, ruleDuplicateKey(r));
      if (existingId === undefined) {
        plan.rules.push(r);
        continue;
      }
      plan.ruleDuplicates++;
      if (r.id !== null) plan.matchedRules[ruleRef(kind, r.id)] = existingId;
    }

    const remaining = existingKeys(db, kind);
    const accepted = kind === 'income' ? plan.incomes : plan.expenses;
    let duplicates = 0;
    for (const e of transactions) {
      const key = expenseDuplicateKey(e);
      const left = remaining.get(key) ?? 0;
      if (left > 0) {
        remaining.set(key, left - 1);
        duplicates++;
        continue;
      }
      const existingRule =
        e.recurring_rule_id === null ? undefined : plan.matchedRules[ruleRef(kind, e.recurring_rule_id)];
      if (
        existingRule !== undefined &&
        db.getFirstSync(
          `SELECT 1 FROM ${TABLES[kind].rows} WHERE recurring_rule_id = ? AND occurrence_date = ?`,
          [existingRule, e.occurrence_date]
        )
      ) {
        duplicates++;
        continue;
      }
      accepted.push(e);
    }
    if (kind === 'income') plan.incomeDuplicates = duplicates;
    else plan.duplicates = duplicates;
  }

  return plan;
}

/** True when the plan would change nothing. */
export function isEmptyPlan(plan: CsvImportPlan): boolean {
  return (
    plan.expenses.length === 0 &&
    plan.incomes.length === 0 &&
    plan.rules.length === 0 &&
    plan.newCategories.length === 0 &&
    plan.categoryUpdates.length === 0
  );
}

/**
 * Applies a plan in one transaction: any failure rolls everything back.
 * Never deletes anything. Rows and rules keep their id from the file when
 * that id is free, so restoring into a fresh install reproduces the same ids.
 */
export function applyCsvImport(db: CsvDatabase, plan: CsvImportPlan): void {
  const now = Date.now();
  const idFree = (table: string, id: number | null) =>
    id !== null && !db.getFirstSync(`SELECT 1 FROM ${table} WHERE id = ?`, [id]);

  db.withTransactionSync(() => {
    for (const c of plan.newCategories) {
      db.runSync(
        `INSERT INTO ${TABLES[c.kind].categories} (name, color, icon, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
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
      db.runSync(`UPDATE ${TABLES[u.kind].categories} SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const categories = { expense: categoriesByName(db, 'expense'), income: categoriesByName(db, 'income') };
    const categoryId = (kind: TransactionKind, row: number, name: string) => {
      const id = categories[kind].get(categoryKey(name))?.id;
      if (id === undefined) throw new Error(`Row ${row}: category "${name}" was not created`);
      return id;
    };

    const ruleIds: Record<string, number> = { ...plan.matchedRules };
    for (const r of plan.rules) {
      const keepId = idFree('recurring_rules', r.id);
      db.runSync(
        `INSERT INTO recurring_rules
           (id, kind, amount, category_id, location, description, frequency, interval, start_date, end_date,
            is_active, last_occurrence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          keepId ? r.id : null,
          r.kind,
          r.amount,
          categoryId(r.kind, r.row, r.category),
          r.location,
          r.description,
          r.frequency,
          r.interval,
          r.start_date,
          r.end_date,
          r.is_active,
          r.last_occurrence,
          r.created_at ?? now,
          r.updated_at ?? now,
        ]
      );
      const id = db.getFirstSync<{ id: number }>('SELECT last_insert_rowid() as id', [])!.id;
      if (r.id !== null) ruleIds[ruleRef(r.kind, r.id)] = id;
    }

    for (const e of [...plan.expenses, ...plan.incomes]) {
      const table = TABLES[e.kind].rows;
      let ruleId = e.recurring_rule_id === null ? null : (ruleIds[ruleRef(e.kind, e.recurring_rule_id)] ?? null);
      // Two rows for the same occurrence of one rule: only the first stays linked.
      if (
        ruleId !== null &&
        db.getFirstSync(`SELECT 1 FROM ${table} WHERE recurring_rule_id = ? AND occurrence_date = ?`, [
          ruleId,
          e.occurrence_date,
        ])
      ) {
        ruleId = null;
      }
      const values: BindValue[] = [
        idFree(table, e.id) ? e.id : null,
        e.amount,
        e.date,
        categoryId(e.kind, e.row, e.category),
        e.description,
        e.metadata,
        ruleId,
        ruleId === null ? null : e.occurrence_date,
        e.created_at ?? now,
        e.updated_at ?? now,
      ];
      if (e.kind === 'expense') {
        db.runSync(
          `INSERT INTO expenses (id, amount, date, category_id, description, metadata, recurring_rule_id,
             occurrence_date, created_at, updated_at, location)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...values, e.location]
        );
      } else {
        db.runSync(
          `INSERT INTO incomes (id, amount, date, category_id, description, metadata, recurring_rule_id,
             occurrence_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values
        );
      }
    }
  });
}
