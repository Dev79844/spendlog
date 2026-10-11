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

> **Note:** All native modules the app uses (SQLite, DateTimePicker, SVG, …) are included in Expo Go for SDK 57, so `npx expo start --go` runs it in Expo Go without a build.

## Releases

Tag a commit on `main` and push the tag. CI then builds a signed arm64 APK and attaches it to a GitHub Release:

```bash
git tag v1.2.3 <commit on main> && git push origin v1.2.3
gh release download v1.2.3 --pattern '*.apk'
adb install -r spendlog-1.2.3.apk   # never uninstall: it would delete your data
```

## Hot reload on the phone

Install Expo Go (SDK 57) from the Play Store, connect the phone over USB, and run:

```bash
scripts/dev-phone.sh            # this checkout
scripts/dev-phone.sh <branch>   # origin/<branch>, in its own worktree
```

The project opens in Expo Go and reloads as you save. Expo Go keeps its own data, separate from the installed Spendlog app.

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