/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 */

import type { MD3Theme } from 'react-native-paper';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

const tintColorLight = '#2E7D32'; // Green for money/expense app
const tintColorDark = '#81C784';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#FAFAFA',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#E0E0E0',
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
  },
  dark: {
    text: '#ECEDEE',
    background: '#121212',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    card: '#1E1E1E',
    border: '#333333',
    success: '#81C784',
    error: '#EF5350',
    warning: '#FFB74D',
  },
};

export const PaperLightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: tintColorLight,
    primaryContainer: '#C8E6C9',
    secondary: '#558B2F',
    secondaryContainer: '#DCEDC8',
    // Income amounts and the income side of the net balance.
    tertiary: '#1565C0',
    background: Colors.light.background,
    surface: Colors.light.card,
    surfaceVariant: '#F5F5F5',
    error: Colors.light.error,
  },
};

export const PaperDarkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: tintColorDark,
    primaryContainer: '#1B5E20',
    secondary: '#AED581',
    secondaryContainer: '#33691E',
    tertiary: '#90CAF9',
    background: Colors.dark.background,
    surface: Colors.dark.card,
    surfaceVariant: '#2D2D2D',
    error: Colors.dark.error,
  },
};
