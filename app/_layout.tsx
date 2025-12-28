import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { PaperDarkTheme, PaperLightTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initDatabase } from '@/lib/db';
import { useCategoryStore } from '@/lib/stores/category-store';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { useSettingsStore } from '@/lib/stores/settings-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const loadCategories = useCategoryStore((s) => s.loadCategories);
  const loadExpenses = useExpenseStore((s) => s.loadExpenses);
  const { themeMode, loadSettings } = useSettingsStore();

  useEffect(() => {
    async function init() {
      try {
        await initDatabase();
        loadSettings();
        await loadCategories();
        await loadExpenses();
      } catch (error) {
        console.error('Failed to initialize database:', error);
      } finally {
        setIsReady(true);
      }
    }
    init();
  }, []);

  // Determine effective color scheme based on settings
  const effectiveColorScheme =
    themeMode === 'system' ? systemColorScheme : themeMode;

  const paperTheme = effectiveColorScheme === 'dark' ? PaperDarkTheme : PaperLightTheme;
  const navTheme = effectiveColorScheme === 'dark' ? DarkTheme : DefaultTheme;

  if (!isReady) {
    return (
      <PaperProvider theme={paperTheme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: paperTheme.colors.background }}>
          <ActivityIndicator size="large" color={paperTheme.colors.primary} />
        </View>
      </PaperProvider>
    );
  }

  return (
    <KeyboardProvider>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={navTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="expense/add"
              options={{ presentation: 'modal', title: 'Add Expense' }}
            />
            <Stack.Screen
              name="expense/[id]"
              options={{ presentation: 'modal', title: 'Edit Expense' }}
            />
            <Stack.Screen
              name="category/add"
              options={{ presentation: 'modal', title: 'Add Category' }}
            />
            <Stack.Screen
              name="category/[id]"
              options={{ presentation: 'modal', title: 'Edit Category' }}
            />
          </Stack>
          <StatusBar style={effectiveColorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </PaperProvider>
    </KeyboardProvider>
  );
}
