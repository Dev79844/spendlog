# AGENTS.md

Spendlog: an offline-first, single-user expense tracker for Android (primary) and iOS. Expo + expo-router, SQLite through `expo-sqlite`, zustand stores, React Native Paper (Material 3) UI. No backend.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev build + run | `npm run android` / `npm run ios` (`expo run:*`, native build) |
| Dev server only | `npm start` (needs a dev build already installed on the device) |
| Web | `npm run web` (not a supported target: there is no metro config for `expo-sqlite`'s web build) |
| Lint | `npm run lint` (`expo lint` caches results; add `-- --no-cache` after changing ESLint or its plugins) |
| Type-check | `npx tsc --noEmit` (no npm script) |
| Tests | `npm test` (CSV export/import, plain Node + `node:sqlite`, no device) |
| Verify migrations | `npm run verify-migrations` (Node 23.6+; runs `lib/db/migrations.ts` on old-schema sample DBs in several timezones) |

There is no test framework; both scripts run under plain Node. Check a change with lint, type-check and `npm test`, run `npm run verify-migrations` when touching the schema or migrations, and run it on a device when behaviour changes.

## Releases

Pushing a tag `vMAJOR.MINOR.PATCH` (MINOR, PATCH < 100) on a commit already on `main` runs `.github/workflows/android-release.yml`. It builds an arm64-v8a release APK and publishes it as the GitHub Release for that tag, with the asset `spendlog-<version>.apk`. versionName is the tag without the `v`, and versionCode is `MAJOR*10000 + MINOR*100 + PATCH`, which must be higher than every published release. Merging to `main` builds nothing.

```sh
git tag vX.Y.Z <commit on main> && git push origin vX.Y.Z
gh release download vX.Y.Z --pattern '*.apk' && adb install -r spendlog-X.Y.Z.apk
```

A tag push runs the workflow file from the tagged commit. To rebuild an existing tag with the workflow from `main` (say, after a CI fix), use `gh workflow run android-release.yml --ref main -f tag=vX.Y.Z`; add `-f dry_run=true` to build and verify without publishing.

The workflow fails unless the APK's signer is the template debug keystore (SHA-256 `FA:C6:17:…:91:03:3B:9C`), because the installed app is signed with it. Never uninstall the app on the phone to update it: it holds the only copy of the data.

## Layout

- `app/`: expo-router routes. `_layout.tsx` is the root Stack and app bootstrap. `(tabs)/` holds Home (`index`), Expenses, Settings. `expense/` and `category/` each have `add.tsx` and `[id].tsx` (edit), presented as modals; register any new modal route in the root Stack.
- `components/`: kebab-case files exporting PascalCase components.
- `lib/db/`: all SQL. `index.ts` opens `spendlog.db`, backs it up and runs the migrations, and seeds default categories. `migrations.ts` holds the schema (see Schema changes). `seed.ts` is dev-only test data, wired to buttons in Settings.
- `lib/date.ts`: local-time date helpers (`toExpenseDay`, `toDayKey`, `getMonthRange`, month keys).
- `lib/stores/`: one zustand store per domain (`category-store`, `expense-store`, `settings-store`).
- `lib/csv.ts`: the CSV interchange format (serialize, parse, validate). Pure and import-free so Node can run it. `lib/db/csv.ts` does the export query and the import plan/apply; it takes the database as a parameter (screens pass `db`) so the tests can use `node:sqlite`. The CSV keeps `YYYY-MM-DD` dates and ISO timestamps whatever the storage format; adapt `lib/db/csv.ts`, not the file format, when the schema changes. UI: `components/csv-data-section.tsx` in Settings.
- `lib/types.ts`: row types, input types, store state types, `DEFAULT_CATEGORIES`.
- `constants/theme.ts`: `PaperLightTheme` / `PaperDarkTheme` and the legacy `Colors` map.

Expo template leftovers, unused by the real screens: `app/(tabs)/explore.tsx` (hidden with `href: null`), `themed-text`, `themed-view`, `parallax-scroll-view`, `hello-wave`, `external-link`, `ui/collapsible`, `ui/icon-symbol*`, `hooks/use-theme-color`.

## Data flow

`lib/db` (synchronous `db.*Sync` calls) → zustand stores → screens.

- `app/_layout.tsx` runs `initDatabase()`, then `loadSettings()`, `loadCategories()`, `loadExpenses()`, and shows a spinner until done. If `initDatabase()` throws (a failed migration), it shows an error screen and loads nothing else.
- Writes go through store actions. They call the `lib/db` function, then reload or patch store state; the expense store re-queries the current month after every write so the joined category fields and `monthlyTotal` stay correct.
- Read-heavy screens query `lib/db` directly and refresh in `useFocusEffect`: Home calls `getMonthlySummary` / `getRecentExpenses`, Expenses paginates with `get*Paginated`. A new list or summary screen follows that pattern, not the store.
- Store state, action signatures, and row types are declared in `lib/types.ts`; update the type there first. `settings-store` defines its own types and `CURRENCIES`.

## Conventions

- **UI**: Paper components (`Text` with `variant`, `Button`, `TextInput mode="outlined"`, `FAB`) and colors from `useTheme().colors`. Static layout in a `StyleSheet.create` at the file bottom; theme colors inline in the `style` array. Icons are `MaterialCommunityIcons` names (also stored in `categories.icon`).
- **Theming**: the root layout picks the Paper and navigation themes from `settings-store.themeMode` (`light` / `dark` / `system`). New colors go in the Paper themes in `constants/theme.ts`, in both light and dark.
- **Imports**: use the `@/` alias (repo root) from `app/` and `components/`; files inside `lib/` import each other relatively.
- **Navigation imports**: since SDK 56, app code must not import `@react-navigation/*`. Use `expo-router` for routing, `expo-router/react-navigation` for themes and `PlatformPressable`, and `expo-router/js-tabs` for bottom-tab types.
- **SQL**: parameterised `?` placeholders. Partial updates build `SET` clauses from the fields that are `!== undefined`, so passing `null` clears a column.
- **Booleans**: SQLite has none. `is_active` is the number `0`/`1`, typed `number`; compare with `=== 1`.
- **Dates**: every date/time column is `INTEGER` epoch milliseconds (`Date.now()`). `expenses.date` is a calendar day stored as local noon of that day: build it with `toExpenseDay(date)` and read it with `new Date(ms)`. Month keys are local `YYYY-MM` strings (`getCurrentMonth`, `toMonthKey`); month filters use `getMonthRange(month)` and query `date >= start AND date < end`. Group by day with `toDayKey`. Convert to local time only at the UI boundary; never derive a day from `toISOString()` (that is UTC), and never parse `'YYYY-MM-DD'` strings with `new Date()` (also UTC).
- **Money**: `amount` is a `REAL` in major units. Display it with `useSettingsStore().formatAmount`, not hand-built strings.
- **Deletes**: categories are soft-deleted (`is_active = 0`) and `getAllCategories` hides inactive ones; expenses are hard-deleted. Confirm destructive actions with `Alert.alert`.

## Gotchas

- `expo-sqlite`, the date picker, and the keyboard controller are native modules: the app does not run in Expo Go. Adding a native dependency means rebuilding with `npm run android` / `ios`, not just restarting Metro.
- **Schema changes** go through `lib/db/migrations.ts`, versioned with `PRAGMA user_version`. Append a migration with the next `version` to `MIGRATIONS`; never edit or reorder one that has shipped, because installs that ran it will not run it again. Each migration runs in its own transaction with the version bump, with foreign keys off; changing a column type means rebuilding the table (create `x_new`, copy, drop, rename, recreate indexes). `initDatabase` copies the DB to `SQLite/spendlog-backup-v<from>-<time>.db` (next to `spendlog.db`) before any pending migration. Keep `migrations.ts` free of runtime imports so `npm run verify-migrations` can load it under Node, and add sample-data checks there for a new migration.
- The user has real data on their phone: a schema change must preserve it, and app updates are installed over the existing app, never by uninstalling (that wipes the database).
- `npm run reset-project` is the Expo template reset. It moves `app/`, `components/`, `hooks/`, `constants/`, and `scripts/` into `app-example/`; never run it.
- Dependency versions change with Expo SDK upgrades; read `package.json` rather than assuming a version, and add Expo packages with `npx expo install` so they match the SDK.
