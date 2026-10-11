# SpendLog 💸

A personal expense tracking app built with React Native and Expo. Vibe coded for personal use—simple, fast, and does exactly what it needs to do.

## What it does

- Track daily expenses with categories
- View monthly spending summaries
- Filter expenses by month or view all time
- Manage custom categories with colors and icons
- Switch between light/dark themes
- Configure your preferred currency

## Tech Stack

- **React Native** + **Expo** (file-based routing)
- **SQLite** (expo-sqlite) for local data persistence
- **Zustand** for state management
- **React Native Paper** for Material Design UI

## Getting Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Run on Android (requires native build for SQLite)

   ```bash
   npx expo run:android
   ```

   Or iOS:

   ```bash
   npx expo run:ios
   ```

> **Note:** This app uses native modules (SQLite, DateTimePicker) and won't work in Expo Go. You need a development build.

## Releases

Tag a commit on `main` and push the tag. CI then builds a signed arm64 APK and attaches it to a GitHub Release:

```bash
git tag v1.2.3 <commit on main> && git push origin v1.2.3
gh release download v1.2.3 --pattern '*.apk'
adb install -r spendlog-1.2.3.apk   # never uninstall: it would delete your data
```

## Preview builds on the phone

To try a branch on an Android phone without touching the installed app or its data, use "Spendlog Preview", a development build with its own package (`com.spendlog.app.preview`) and data. Push to a `preview/**` branch to have CI build it, then:

```bash
gh run download <run-id> --name spendlog-preview-dev-<sha>
scripts/preview-phone.sh install spendlog-preview-dev-<sha>.apk
scripts/preview-phone.sh start <branch>   # Metro on :8082 over USB; keep the phone plugged in
```

## Project Structure

```
app/           # Screens (file-based routing)
components/    # Reusable UI components
lib/
  ├── db/      # SQLite database operations
  ├── stores/  # Zustand state stores
  └── types.ts # TypeScript interfaces
constants/     # Theme configuration
```

## License
MIT License