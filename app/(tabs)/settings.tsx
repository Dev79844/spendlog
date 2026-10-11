import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Divider,
  IconButton,
  Modal,
  Portal,
  RadioButton,
  Text,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CsvDataSection } from '@/components/csv-data-section';
import { db } from '@/lib/db';
import { getCategoryExpenseCount } from '@/lib/db/categories';
import { getOpenDateReviewCount } from '@/lib/db/date-review';
import { getCategoryRuleCount } from '@/lib/db/recurring';
import { seedTestData, clearAllExpenses, getExpenseCount } from '@/lib/db/seed';
import { useCategoryStore } from '@/lib/stores/category-store';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { useRecurringStore } from '@/lib/stores/recurring-store';
import {
  CURRENCIES,
  type Currency,
  type ThemeMode,
  useSettingsStore,
} from '@/lib/stores/settings-store';
import type { Category, TransactionKind } from '@/lib/types';

// Set to false for production
const DEV_MODE = true;

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { categories, incomeCategories, loadCategories, deleteCategory } = useCategoryStore();
  const { rules, loadRules } = useRecurringStore();
  const { loadExpenses } = useExpenseStore();
  const { currency, themeMode, setCurrency, setThemeMode } = useSettingsStore();

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [expenseCount, setExpenseCount] = useState(0);
  const [dateReview, setDateReview] = useState({ pending: 0, fixed: 0 });

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      setDateReview(getOpenDateReviewCount(db));
      loadRules();
      if (DEV_MODE) {
        setExpenseCount(getExpenseCount());
      }
    }, [])
  );

  const handleDeleteCategory = (id: number, name: string, kind: TransactionKind = 'expense') => {
    const count = getCategoryExpenseCount(id, kind);
    const ruleCount = getCategoryRuleCount(db, id, kind);

    if (count > 0 || ruleCount > 0) {
      const noun = kind === 'income' ? 'income entr' : 'expense';
      const used = [
        count > 0 ? `${count} ${noun}${count > 1 ? (kind === 'income' ? 'ies' : 's') : kind === 'income' ? 'y' : ''}` : '',
        ruleCount > 0 ? `${ruleCount} recurring rule${ruleCount > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      Alert.alert(
        'Cannot Delete',
        `"${name}" is used by ${used.join(' and ')}. Delete or reassign those first.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert('Delete Category', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteCategory(id, kind),
      },
    ]);
  };

  const handleSeedData = () => {
    Alert.alert(
      'Seed Test Data',
      'This will add ~200-400 random expenses across 2025. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed',
          onPress: () => {
            seedTestData();
            loadExpenses();
            setExpenseCount(getExpenseCount());
            Alert.alert('Done', 'Test data has been seeded!');
          },
        },
      ]
    );
  };

  const handleClearExpenses = () => {
    Alert.alert(
      'Clear All Expenses',
      'This will delete ALL expenses. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            clearAllExpenses();
            loadExpenses();
            setExpenseCount(0);
            Alert.alert('Done', 'All expenses have been deleted.');
          },
        },
      ]
    );
  };

  const getThemeLabel = (mode: ThemeMode) => {
    switch (mode) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System Default';
    }
  };

  const renderCategories = (title: string, list: Category[], kind: TransactionKind) => {
    const query = kind === 'income' ? '?kind=income' : '';
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
            {title}
          </Text>
          <IconButton
            icon="plus"
            mode="contained"
            size={20}
            onPress={() => router.push(`/category/add${query}` as any)}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          {list.map((category, index) => (
            <React.Fragment key={category.id}>
              <Pressable
                onPress={() => router.push(`/category/${category.id}${query}` as any)}
                style={({ pressed }) => [styles.categoryItem, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={styles.categoryLeft}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: category.color ?? theme.colors.primary },
                    ]}
                  />
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                    {category.name}
                  </Text>
                </View>
                <View style={styles.categoryRight}>
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    iconColor={theme.colors.error}
                    onPress={() => handleDeleteCategory(category.id, category.name, kind)}
                  />
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={theme.colors.onSurfaceVariant}
                  />
                </View>
              </Pressable>
              {index < list.length - 1 && <Divider />}
            </React.Fragment>
          ))}

          {list.length === 0 && (
            <View style={styles.emptyState}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No categories. Tap + to add one.
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
      {/* Preferences Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
          Preferences
        </Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          {/* Currency Setting */}
          <Pressable
            onPress={() => setCurrencyModalVisible(true)}
            style={({ pressed }) => [styles.settingItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons
                name="currency-usd"
                size={24}
                color={theme.colors.primary}
              />
              <View>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  Currency
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {currency.symbol} {currency.name}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </Pressable>

          <Divider />

          {/* Theme Setting */}
          <Pressable
            onPress={() => setThemeModalVisible(true)}
            style={({ pressed }) => [styles.settingItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons
                name={themeMode === 'dark' ? 'weather-night' : themeMode === 'light' ? 'white-balance-sunny' : 'theme-light-dark'}
                size={24}
                color={theme.colors.primary}
              />
              <View>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  Theme
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {getThemeLabel(themeMode)}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </Pressable>
        </View>
      </View>

      {/* Recurring Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
          Recurring
        </Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Pressable
            onPress={() => router.push('/recurring' as any)}
            style={({ pressed }) => [styles.settingItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="repeat" size={24} color={theme.colors.primary} />
              <View>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  Recurring expenses & income
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {rules.length === 0
                    ? 'Rent, subscriptions, salary…'
                    : `${rules.filter((r) => r.is_active === 1).length} active, ${rules.filter((r) => r.is_active !== 1).length} paused`}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      {renderCategories('Categories', categories, 'expense')}
      {renderCategories('Income Categories', incomeCategories, 'income')}

      {/* Data Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
          Data
        </Text>
        {dateReview.pending + dateReview.fixed > 0 && (
          <Pressable
            onPress={() => router.push('/review-dates' as any)}
            style={({ pressed }) => [
              styles.card,
              styles.settingItem,
              { backgroundColor: theme.colors.surface, marginBottom: 12, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="calendar-alert" size={24} color={theme.colors.primary} />
              <View style={{ flexShrink: 1 }}>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  Review dates
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {dateReview.pending > 0
                    ? `${dateReview.pending} expense${dateReview.pending === 1 ? '' : 's'} may be a day off`
                    : `${dateReview.fixed} date${dateReview.fixed === 1 ? '' : 's'} corrected automatically`}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </Pressable>
        )}
        <CsvDataSection
          onImported={() => {
            // Imported rules may already be due.
            useRecurringStore.getState().runDue();
            loadRules();
            loadCategories();
            loadExpenses();
            if (DEV_MODE) {
              setExpenseCount(getExpenseCount());
            }
          }}
        />
      </View>

      {/* Dev Tools Section - Only shown in DEV_MODE */}
      {DEV_MODE && (
        <View style={styles.section}>
          <Text variant="titleMedium" style={{ color: theme.colors.error, marginBottom: 12 }}>
            Developer Tools
          </Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, padding: 16 }]}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
              Current expenses: {expenseCount}
            </Text>
            <View style={{ gap: 12 }}>
              <Button
                mode="contained"
                icon="database-plus"
                onPress={handleSeedData}
                buttonColor={theme.colors.primary}>
                Seed Test Data (2025)
              </Button>
              <Button
                mode="outlined"
                icon="delete-sweep"
                onPress={handleClearExpenses}
                textColor={theme.colors.error}
                style={{ borderColor: theme.colors.error }}>
                Clear All Expenses
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* About Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
          About
        </Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, padding: 16 }]}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            SpendLog v1.0.0
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            A simple, offline-first expense tracker
          </Text>
        </View>
      </View>

      {/* Currency Modal */}
      <Portal>
        <Modal
          visible={currencyModalVisible}
          onDismiss={() => setCurrencyModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ marginBottom: 16, color: theme.colors.onSurface }}>
            Select Currency
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            <RadioButton.Group
              value={currency.code}
              onValueChange={(code) => {
                const selected = CURRENCIES.find((c) => c.code === code);
                if (selected) {
                  setCurrency(selected);
                  setCurrencyModalVisible(false);
                }
              }}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setCurrency(c);
                    setCurrencyModalVisible(false);
                  }}
                  style={styles.radioItem}>
                  <View style={styles.radioLeft}>
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                      {c.symbol}
                    </Text>
                    <View>
                      <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                        {c.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {c.code}
                      </Text>
                    </View>
                  </View>
                  <RadioButton value={c.code} />
                </Pressable>
              ))}
            </RadioButton.Group>
          </ScrollView>
          <Button onPress={() => setCurrencyModalVisible(false)} style={{ marginTop: 16 }}>
            Cancel
          </Button>
        </Modal>
      </Portal>

      {/* Theme Modal */}
      <Portal>
        <Modal
          visible={themeModalVisible}
          onDismiss={() => setThemeModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ marginBottom: 16, color: theme.colors.onSurface }}>
            Select Theme
          </Text>
          <RadioButton.Group
            value={themeMode}
            onValueChange={(mode) => {
              setThemeMode(mode as ThemeMode);
              setThemeModalVisible(false);
            }}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  setThemeMode(mode);
                  setThemeModalVisible(false);
                }}
                style={styles.radioItem}>
                <View style={styles.radioLeft}>
                  <MaterialCommunityIcons
                    name={
                      mode === 'dark'
                        ? 'weather-night'
                        : mode === 'light'
                        ? 'white-balance-sunny'
                        : 'theme-light-dark'
                    }
                    size={24}
                    color={theme.colors.primary}
                  />
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                    {getThemeLabel(mode)}
                  </Text>
                </View>
                <RadioButton value={mode} />
              </Pressable>
            ))}
          </RadioButton.Group>
          <Button onPress={() => setThemeModalVisible(false)} style={{ marginTop: 16 }}>
            Cancel
          </Button>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
  },
  radioItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  radioLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
