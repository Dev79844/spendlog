import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ActivityIndicator, PaperProvider, Text } from 'react-native-paper';
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
  const [initError, setInitError] = useState<string | null>(null);
  const loadCategories = useCategoryStore((s) => s.loadCategories);
  const loadExpenses = useExpenseStore((s) => s.loadExpenses);
  const { themeMode, loadSettings } = useSettingsStore();

  useEffect(() => {
    async function init() {
      try {
        await initDatabase();
      } catch (error) {
        // A failed migration is rolled back, leaving the old schema. Stop here:
        // the rest of the app would write new-format rows into it.
        console.error('Failed to initialize database:', error);
        setInitError((error as Error).message);
        return;
      }
      try {
        loadSettings();
        await loadCategories();
        await loadExpenses();
      } catch (error) {
        console.error('Failed to load data:', error);
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

  if (initError) {
    return (
      <PaperProvider theme={paperTheme}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: paperTheme.colors.background }}>
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>
            Could not open your data
          </Text>
          <Text variant="bodyMedium">
            Updating the database failed and no changes were made. Your data is still on this device. Please
            don&apos;t uninstall the app.
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 12, color: paperTheme.colors.error }}>
            {initError}
          </Text>
        </View>
      </PaperProvider>
    );
  }

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
            <Stack.Screen
              name="review-dates"
              options={{ presentation: 'modal', title: 'Review Dates' }}
            />
          </Stack>
          <StatusBar style={effectiveColorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </PaperProvider>
    </KeyboardProvider>
  );
}
