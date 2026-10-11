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
| Tests | `npm test` (CSV export/import, recurring rules, Insights aggregates and the shifted-dates migration, plain Node + `node:sqlite`, no device; each file under three timezones) |
| Verify migrations | `npm run verify-migrations` (Node 23.6+; runs `lib/db/migrations.ts` on old-schema sample DBs in several timezones) |

There is no test framework; both scripts run under plain Node. Check a change with lint, type-check and `npm test`, run `npm run verify-migrations` when touching the schema or migrations, and run it on a device when behaviour changes.

## Releases

Pushing a tag `vMAJOR.MINOR.PATCH` (MINOR, PATCH < 100) on a commit already on `main` runs `.github/workflows/android-release.yml`. It builds an arm64-v8a release APK and publishes it as the GitHub Release for that tag, with the asset `spendlog-<version>.apk`. versionName is the tag without the `v`, and versionCode is `MAJOR*10000 + MINOR*100 + PATCH`, which must be higher than every published release. Merging to `main` builds nothing.

```sh
git tag vX.Y.Z <commit on main> && git push origin vX.Y.Z
gh release download vX.Y.Z --pattern '*.apk' && adb install -r spendlog-X.Y.Z.apk
```

A tag push runs the workflow file from the tagged commit. To rebuild an existing tag with the workflow from `main` (say, after a CI fix), use `gh workflow run android-release.yml --ref main -f tag=vX.Y.Z`; add `-f dry_run=true` to build and verify without publishing.

Release notes list the PRs merged since the previous published release (highest versionCode below the tag), from GitHub's release-notes generator via `.github/scripts/release-pr-list.sh`, followed by the build info. If that fails, the release is still published with the build info only, and a warning. The workflow reads the script from its own commit, so a manual rebuild of an older tag still gets it. After changing it, run `.github/scripts/test-release-pr-list.sh` (stubbed `gh`, no network) and `actionlint`.

The workflow re-signs the APK with key rotation (see Signing) and fails unless its signers are exactly the expected ones. Never uninstall the app on the phone to update it: it holds the only copy of the data.

## Signing

Releases up to v1.3.0 are signed only with the public React Native/Expo template `debug.keystore` (alias `androiddebugkey`, SHA-256 `FA:C6:17:…:91:03:3B:9C`), which anyone can sign with. Later releases use APK Signature Scheme v3 key rotation to the private release key (alias `spendlog`, RSA 4096, SHA-256 `37:CB:1F:…:E3:A1:3C`), so they still install with `adb install -r` over an app signed with the template key:

- `android-signing/lineage.bin` is the proof of rotation, made once with `apksigner rotate` (template key → private key). It holds both certificates and the template key's signature over the new one, no private key; every rotated APK carries a copy, so it is public. The template key keeps only the installed-data capability (updates keep the app's data); shared UID, permission, auth and rollback are off, so an APK signed only with the template key can no longer update the app once a rotated release is installed.
- `.github/scripts/sign-release-apk.sh` re-signs Gradle's APK (still signed with the template key by the prebuild config): v3.1 block (Android 13+, `--rotation-min-sdk-version 33`) with the private key and the lineage; v3.0 (Android 9–12) and v2 (Android 7–8) with the template key. No v1 or v4, as with Gradle at minSdk 24. `.github/scripts/verify-apk-signers.sh` fails on any other signer, a missing v3.1 block or a different lineage. The workflow takes both scripts and the lineage from its own commit.
- The private key lives only in `~/.config/spendlog-signing/` on the dev machine (`spendlog-release.p12`, PKCS12, and `keystore-password`, which is also the key password; directory 700, files 600) and in the Actions secrets `SPENDLOG_KEYSTORE_B64` and `SPENDLOG_KEYSTORE_PASSWORD`, set by `scripts/set-signing-secrets.sh` (checks the keystore against the workflow's `EXPECTED_SIGNER_SHA256` first, never prints the values). Without them the release job fails before signing. Never commit, print or log the keystore or its password.
- The user keeps an offline backup of both files (password manager or encrypted USB). Losing the key means no further update can install over the app: the only way out would be CSV export → uninstall → install → import.
- The template key is still needed (v2/v3.0 signatures and the lineage's first entry); the workflow uses the prebuild's `android/app/debug.keystore` and checks its fingerprint. The phone (Android 16) reads only the v3.1 block. If Android ever refused a rotated update, `adb install -r` fails and the installed app is unchanged.

Check a signed APK locally with `APKSIGNER=<build-tools>/apksigner EXPECTED_SIGNER_SHA256=… TEMPLATE_SIGNER_SHA256=… .github/scripts/verify-apk-signers.sh <apk>`; `apksigner` (`lib/apksigner.jar`) is plain Java, so the Linux build-tools zip works on aarch64 too.

## Preview builds on the phone

"Spendlog Preview" (`com.spendlog.app.preview`, scheme `spendlog-preview`) is a development build (expo-dev-client) that installs next to the real app, with its own empty database, and loads JS from Metro on this machine. `app.config.ts` applies it when `APP_VARIANT=preview`; unset, the config is exactly `app.json`, so release builds are unaffected.

- Build: `.github/workflows/android-preview.yml` runs on pushes to `preview/**` branches (and, once on `main`, `gh workflow run android-preview.yml -f ref=<branch>`), and uploads `spendlog-preview-dev-<sha>.apk` as a workflow artifact. Rebuild only when native modules change; the dev build must contain every native module of the branches it serves.
- Install: `gh run download <run-id> --name spendlog-preview-dev-<sha>`, then `scripts/preview-phone.sh install <apk>`, which refuses any APK that is not `com.spendlog.app.preview` with the dev launcher (`scripts/apk-info.py` reads the manifest; no aapt2 needed).
- Serve: `scripts/preview-phone.sh start [branch | dir]` runs Metro on port 8082 (`--localhost`), sets `adb reverse`, and opens the preview app. A branch name gets its own worktree, `../preview-<name>`. The phone must stay on USB.
- Never install, uninstall, clear or `am start` `com.spendlog.app` for previews. Seed the preview app with Settings → Seed Test Data or a CSV the user chooses to import.

## Layout

- `app/`: expo-router routes. `_layout.tsx` is the root Stack and app bootstrap. `(tabs)/` holds Home (`index`), Transactions (`expenses.tsx`, an Expenses/Income segment), Insights, Settings. `expense/` and `category/` each have `add.tsx` and `[id].tsx` (edit), presented as modals; both take `?kind=income` for income entries and income categories. `recurring/` is the rule list (`index`, pushed from Settings) and the add/edit modals. Register any new route in the root Stack.
- `components/`: kebab-case files exporting PascalCase components.
- `lib/db/`: all SQL. `index.ts` opens `spendlog.db`, backs it up and runs the migrations, and seeds default categories. `migrations.ts` holds the schema (see Schema changes). `seed.ts` is dev-only test data, wired to buttons in Settings. `date-review.ts` reads and resolves the `date_review` table (see Shifted dates); like `csv.ts` it takes the database as a parameter.
- `lib/date.ts`: local-time date helpers (`toExpenseDay`, `toDayKey`, `getMonthRange`, month keys) and the parsers that turn date/time text into stored epoch ms (`parseExpenseDay`, `parseTimestamp`). Pure and import-free.
- `lib/stores/`: one zustand store per domain (`category-store` (both kinds), `expense-store`, `income-store`, `recurring-store`, `settings-store`).
- Income: own tables `incomes` and `income_categories` (not a type column on `expenses`), so expense queries and totals never need a filter; a net balance is an income sum minus an expense sum over the same range. `lib/db/incomes.ts` mirrors `expenses.ts`; `lib/db/categories.ts` functions take a `TransactionKind`.
- Recurring rules: `recurring_rules` (kind, amount, category, frequency + interval, start/end day, `is_active`, `last_occurrence` cursor). `lib/recurrence.ts` is the pure schedule maths (occurrence n is computed from the start, month end clamped). `lib/db/recurring.ts` (takes the db as a parameter, like `lib/db/csv.ts`) holds the CRUD and `materializeDueOccurrences`, which generates due rows as ordinary expense/income rows with `recurring_rule_id` + `occurrence_date` (unique together) and moves the cursor in the same transaction. There is no background job: `_layout.tsx` runs it on start and on every return to the foreground; screens re-query when `recurring-store.generation` changes. Deleting a rule unlinks its rows and keeps them.
- `lib/csv.ts`: the CSV interchange format (serialize, parse, validate). Pure (its only import is `lib/date.ts`) so Node can run it. `lib/db/csv.ts` does the export query and the import plan/apply; it takes the database as a parameter (screens pass `db`) so the tests can use `node:sqlite`. The file holds expenses, income, both kinds of categories and recurring rules, told apart by `record_type`; the columns after `category_active` came with income and are optional on import. It keeps `YYYY-MM-DD` dates (local day) and ISO UTC timestamps; export converts from the stored epoch ms, and import converts back with `parseExpenseDay` / `parseTimestamp` from `lib/date.ts`, the same parsers migration 1 uses, so imported and migrated rows are stored identically. Adapt `lib/db/csv.ts`, not the file format, when the schema changes. `scripts/fixtures/pre-migration-export.csv` is a file written by the pre-migration app; never regenerate it with current code. UI: `components/csv-data-section.tsx` in Settings.
- `app/review-dates.tsx`: the Review dates modal (keep / move / undo per expense), reached from Settings › Data, which shows the entry only while `date_review` has open rows.
- `lib/types.ts`: row types, input types, store state types, `DEFAULT_CATEGORIES`.
- `constants/theme.ts`: `PaperLightTheme` / `PaperDarkTheme` and the legacy `Colors` map.

- `lib/db/insights.ts`: SQL aggregates for the Insights tab (month breakdown, daily totals, largest expenses, monthly and per-category trends). Like `lib/db/csv.ts` it takes the database as a parameter and imports only `lib/date.ts`, so `scripts/test-insights.mjs` runs it under Node. Month and day boundaries are local ranges built with `getMonthRange` / `getMonthDayRanges` and joined as a `VALUES` table, not SQLite date functions. Sums are named by what they sum: `expenses`, `income` (the `incomes` table) and `net = income - expenses` over the same ranges; the trend sums each table in its own subquery so neither is multiplied by the other's rows. Category breakdowns are expenses only. Charts use `react-native-gifted-charts` (on `react-native-svg`, with `expo-linear-gradient` as its gradient peer).
- `components/month-picker-modal.tsx`: the month picker shared by Expenses and Insights.

## Data flow

`lib/db` (synchronous `db.*Sync` calls) → zustand stores → screens.

- `app/_layout.tsx` runs `initDatabase()`, then `loadSettings()`, `loadCategories()`, `loadExpenses()`, and shows a spinner until done. If `initDatabase()` throws (a failed migration), it shows an error screen and loads nothing else.
- Writes go through store actions. They call the `lib/db` function, then reload or patch store state; the expense store re-queries the current month after every write so the joined category fields and `monthlyTotal` stay correct.
- Read-heavy screens query `lib/db` directly and refresh in `useFocusEffect`: Home calls `getMonthlySummary` / `getRecentExpenses`, Expenses paginates with `get*Paginated`, Insights calls `lib/db/insights.ts` with `db`. A new list or summary screen follows that pattern, not the store.
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
- **Deletes**: categories are soft-deleted (`is_active = 0`) and `getAllCategories` hides inactive ones; expenses, income entries and recurring rules are hard-deleted (a rule's generated rows stay). Confirm destructive actions with `Alert.alert`.

## Gotchas

- `expo-sqlite`, the date picker, and the keyboard controller are native modules: the app does not run in Expo Go. Adding a native dependency means rebuilding with `npm run android` / `ios`, not just restarting Metro.
- **Schema changes** go through `lib/db/migrations.ts`, versioned with `PRAGMA user_version`. Append a migration with the next `version` to `MIGRATIONS`; never edit or reorder one that has shipped, because installs that ran it will not run it again. Each migration runs in its own transaction with the version bump, with foreign keys off; changing a column type means rebuilding the table (create `x_new`, copy, drop, rename, recreate indexes). `initDatabase` copies the DB to `SQLite/spendlog-backup-v<from>-<time>.db` (next to `spendlog.db`) before any pending migration. `migrations.ts` may import only pure modules (`lib/date.ts`) so `npm run verify-migrations` can load it under Node; add sample-data checks there for a new migration. Changing the parsers in `lib/date.ts` also changes what migration 1 does on installs that haven't run it yet. Migrations: 1 `epoch-ms-dates`, 2 `shifted-expense-dates`, 3 `income-and-recurring` (additive: new tables and two columns on `expenses`; a later migration that rebuilds `expenses` must keep `recurring_rule_id`, `occurrence_date` and the unique `idx_expenses_occurrence`). A migration receives a `MigrationContext` (`fromVersion`, and `originalSchemaMigratedAt`, which `initDatabase` reads from the name of the newest `spendlog-backup-v0-*.db`).
- **Shifted dates**: the pre-1.2 app stored days with `toISOString()`, so some old rows are a day off. That happened in the add screen when it was opened between local midnight and the UTC offset (00:00–05:29 in IST), and on every edit-screen save east of UTC. Migration 2 (`shifted-expense-dates`) moves only rows where exactly one shift fits. It records every row it fixed or doubts in `date_review` (`expense_id`, `expense_created_at`, `reason` `add-shifted`/`add-uncertain`/`edited`, `status` `fixed`/`pending`/`moved`/`kept`/`undone`, `original_date`, `suggested_date`, `resolved_at`). Rows are matched to expenses by id and `created_at`, and drop out of the review once their date changes. CSV import does not apply this fix.
- The user has real data on their phone: a schema change must preserve it, and app updates are installed over the existing app, never by uninstalling (that wipes the database).
- `npm run reset-project` is the Expo template reset. It moves `app/`, `components/`, `hooks/`, `constants/`, and `scripts/` into `app-example/`; never run it.
- Dependency versions change with Expo SDK upgrades; read `package.json` rather than assuming a version, and add Expo packages with `npx expo install` so they match the SDK.
