// A database as the pre-migration app (schema version 0, TEXT dates) left it,
// with fixed values so it can be rebuilt identically. Used by
// scripts/test-csv.mjs together with pre-migration-export.csv, which is this
// database exported by the pre-migration app's own CSV code (see
// generate-pre-migration-export.mjs).
//
// Expense dates are what the old app stored: the UTC day from
// `toISOString()`, so the near-midnight IST rows carry the shifted day.

export const PRE_MIGRATION_SQL = `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE expenses (
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
  CREATE INDEX idx_expenses_date ON expenses(date);
  CREATE INDEX idx_expenses_category ON expenses(category_id);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- Seeded by the old initDatabase(): CURRENT_TIMESTAMP form, UTC.
  INSERT INTO categories (name, color, icon, created_at) VALUES
    ('Food & Dining', '#FF6B6B', 'food', '2025-01-01 03:00:00'),
    ('Transportation', '#4ECDC4', 'car', '2025-01-01 03:00:00'),
    ('Shopping', '#45B7D1', 'cart', '2025-01-01 03:00:00'),
    ('Bills & Utilities', '#96CEB4', 'file-document', '2025-01-01 03:00:00'),
    ('Entertainment', '#DDA0DD', 'movie', '2025-01-01 03:00:00'),
    ('Healthcare', '#98D8C8', 'medical-bag', '2025-01-01 03:00:00'),
    ('Education', '#F7DC6F', 'school', '2025-01-01 03:00:00'),
    ('Others', '#BDC3C7', 'dots-horizontal', '2025-01-01 03:00:00');
  -- User changes: a recoloured default, a new category, a deleted one.
  UPDATE categories SET color = '#123456', icon = 'pizza' WHERE name = 'Food & Dining';
  INSERT INTO categories (name, color, icon, created_at) VALUES ('Pets 🐶', '#ABCDEF', 'dog', '2025-02-01 18:45:12');
  INSERT INTO categories (name, color, icon, is_active, created_at) VALUES ('Old, "retired"', NULL, NULL, 0, '2025-02-02 00:00:00');
  UPDATE categories SET is_active = 0 WHERE name = 'Entertainment';

  INSERT INTO expenses (id, amount, date, category_id, location, description, metadata, created_at, updated_at) VALUES
    -- 15 Mar 2025 14:00 IST.
    (1, 250, '2025-03-15', 1, 'Café "Zoë", MG Road', 'line one
line two', NULL, '2025-03-15T08:30:00.000Z', '2025-03-15T08:30:00.000Z'),
    -- Entered 16 Mar 00:20 IST: the UTC bug stored the 15th.
    (2, 120, '2025-03-15', 1, NULL, 'shifted', NULL, '2025-03-15T18:50:00.000Z', '2025-03-15T18:50:00.000Z'),
    -- Entered 1 Apr 00:10 IST: stored under 31 Mar.
    (3, 999.5, '2025-03-31', 2, NULL, 'shifted-month', '{"tags":["a,b"]}', '2025-03-31T18:40:00.000Z', '2025-03-31T18:40:00.000Z'),
    (4, 0.30000000000000004, '2025-04-01', 2, NULL, NULL, NULL, '2025-04-01T00:15:00.000Z', '2025-04-01T00:15:00.000Z'),
    -- US DST start day, a leap day, and an edited row.
    (5, 75, '2025-03-09', 3, NULL, 'dst', NULL, '2025-03-09T10:00:00.000Z', '2025-03-09T10:00:00.000Z'),
    (6, 60, '2024-02-29', 9, NULL, 'leap', NULL, '2024-02-29T10:00:00.000Z', '2024-02-29T10:00:00.000Z'),
    (7, 33, '2025-02-10', 1, NULL, 'edited', NULL, '2025-02-11T09:00:00.000Z', '2025-02-12T09:00:00.000Z'),
    -- Timestamps left to the CURRENT_TIMESTAMP default.
    (8, 10, '2025-01-01', 5, NULL, 'sqlite-default', NULL, '2025-01-01 04:05:06', '2025-01-01 04:05:06'),
    -- In a deleted category, after a gap in the ids.
    (11, 1234567.89, '2024-12-31', 10, NULL, '  spaced  ', NULL, '2024-12-31T23:59:59.999Z', '2025-01-02T00:00:00.000Z');

  INSERT INTO settings (key, value) VALUES ('currency', 'INR');
`;
