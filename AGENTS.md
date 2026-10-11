# AGENTS.md

Spendlog: an offline-first, single-user expense tracker for Android (primary) and iOS. Expo + expo-router, SQLite through `expo-sqlite`, zustand stores, React Native Paper (Material 3) UI. No backend.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev build + run | `npm run android` / `npm run ios` (`expo run:*`, native build) |
| Dev server only | `npm start` (needs a dev build already installed on the device) |
| Web | `npm run web` (not a supported target: there is no metro config for `expo-sqlite`'s web build) |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` (no npm script) |

There are no tests. Check a change with lint plus type-check, and run it on a device when behaviour changes.

## Layout

- `app/`: expo-router routes. `_layout.tsx` is the root Stack and app bootstrap. `(tabs)/` holds Home (`index`), Expenses, Settings. `expense/` and `category/` each have `add.tsx` and `[id].tsx` (edit), presented as modals; register any new modal route in the root Stack.
- `components/`: kebab-case files exporting PascalCase components.
- `lib/db/`: all SQL. `index.ts` opens `spendlog.db`, creates tables, seeds default categories, and holds the date helpers. `seed.ts` is dev-only test data, wired to buttons in Settings.
- `lib/stores/`: one zustand store per domain (`category-store`, `expense-store`, `settings-store`).
- `lib/types.ts`: row types, input types, store state types, `DEFAULT_CATEGORIES`.
- `constants/theme.ts`: `PaperLightTheme` / `PaperDarkTheme` and the legacy `Colors` map.

Expo template leftovers, unused by the real screens: `app/(tabs)/explore.tsx` (hidden with `href: null`), `themed-text`, `themed-view`, `parallax-scroll-view`, `hello-wave`, `external-link`, `ui/collapsible`, `ui/icon-symbol*`, `hooks/use-theme-color`.

## Data flow

`lib/db` (synchronous `db.*Sync` calls) → zustand stores → screens.

- `app/_layout.tsx` runs `initDatabase()`, then `loadSettings()`, `loadCategories()`, `loadExpenses()`, and shows a spinner until done.
- Writes go through store actions. They call the `lib/db` function, then reload or patch store state; the expense store re-queries the current month after every write so the joined category fields and `monthlyTotal` stay correct.
- Read-heavy screens query `lib/db` directly and refresh in `useFocusEffect`: Home calls `getMonthlySummary` / `getRecentExpenses`, Expenses paginates with `get*Paginated`. A new list or summary screen follows that pattern, not the store.
- Store state, action signatures, and row types are declared in `lib/types.ts`; update the type there first. `settings-store` defines its own types and `CURRENCIES`.

## Conventions

- **UI**: Paper components (`Text` with `variant`, `Button`, `TextInput mode="outlined"`, `FAB`) and colors from `useTheme().colors`. Static layout in a `StyleSheet.create` at the file bottom; theme colors inline in the `style` array. Icons are `MaterialCommunityIcons` names (also stored in `categories.icon`).
- **Theming**: the root layout picks the Paper and navigation themes from `settings-store.themeMode` (`light` / `dark` / `system`). New colors go in the Paper themes in `constants/theme.ts`, in both light and dark.
- **Imports**: use the `@/` alias (repo root) from `app/` and `components/`; files inside `lib/` import each other relatively.
- **SQL**: parameterised `?` placeholders. Partial updates build `SET` clauses from the fields that are `!== undefined`, so passing `null` clears a column.
- **Booleans**: SQLite has none. `is_active` is the number `0`/`1`, typed `number`; compare with `=== 1`.
- **Dates**: `expenses.date` is `YYYY-MM-DD` (from `formatDate`), month keys are `YYYY-MM` (`getCurrentMonth`), and month filters match `date LIKE 'YYYY-MM%'`. `created_at` / `updated_at` are ISO timestamps.
- **Money**: `amount` is a `REAL` in major units. Display it with `useSettingsStore().formatAmount`, not hand-built strings.
- **Deletes**: categories are soft-deleted (`is_active = 0`) and `getAllCategories` hides inactive ones; expenses are hard-deleted. Confirm destructive actions with `Alert.alert`.

## Gotchas

- `expo-sqlite`, the date picker, and the keyboard controller are native modules: the app does not run in Expo Go. Adding a native dependency means rebuilding with `npm run android` / `ios`, not just restarting Metro.
- Schema changes have no migrations. `initDatabase` uses `CREATE TABLE IF NOT EXISTS`, so a new column never reaches an existing install. Add an explicit `ALTER TABLE` step guarded by a check of `PRAGMA table_info`.
- The `settings` table is created by `settings-store.loadSettings()`, not by `initDatabase()`.
- `formatDate` uses `toISOString()`, which is UTC: near local midnight in a non-UTC timezone it yields the neighbouring day. Keep that in mind when touching date logic.
- `npm run reset-project` is the Expo template reset. It moves `app/`, `components/`, `hooks/`, `constants/`, and `scripts/` into `app-example/`; never run it.
- Dependency versions change with Expo SDK upgrades; read `package.json` rather than assuming a version, and add Expo packages with `npx expo install` so they match the SDK.
