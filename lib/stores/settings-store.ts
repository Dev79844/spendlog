import { create } from 'zustand';
import { db } from '../db';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
];

export interface SettingsState {
  currency: Currency;
  themeMode: ThemeMode;
  loading: boolean;
  loadSettings: () => void;
  setCurrency: (currency: Currency) => void;
  setThemeMode: (mode: ThemeMode) => void;
  formatAmount: (amount: number) => string;
}

function getSetting(key: string): string | null {
  try {
    const result = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return result?.value ?? null;
  } catch {
    return null;
  }
}

function setSetting(key: string, value: string): void {
  db.runSync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  currency: CURRENCIES[0], // INR default
  themeMode: 'system',
  loading: true,

  loadSettings: () => {
    try {
      // The settings table is created by the schema migrations (lib/db/migrations.ts).
      const currencyCode = getSetting('currency');
      const themeMode = getSetting('themeMode') as ThemeMode | null;

      const currency = CURRENCIES.find((c) => c.code === currencyCode) ?? CURRENCIES[0];

      set({
        currency,
        themeMode: themeMode ?? 'system',
        loading: false,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ loading: false });
    }
  },

  setCurrency: (currency: Currency) => {
    setSetting('currency', currency.code);
    set({ currency });
  },

  setThemeMode: (mode: ThemeMode) => {
    setSetting('themeMode', mode);
    set({ themeMode: mode });
  },

  formatAmount: (amount: number) => {
    const { currency } = get();
    return `${currency.symbol}${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  },
}));
