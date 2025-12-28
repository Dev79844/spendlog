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