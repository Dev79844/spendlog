import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FAB, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpenseCard } from '@/components/expense-card';
import { SummaryCard } from '@/components/summary-card';
import { getMonthlySummary, getRecentExpenses } from '@/lib/db/expenses';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { ExpenseWithCategory, MonthlySummary } from '@/lib/types';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentMonth, loadExpenses } = useExpenseStore();
  const formatAmount = useSettingsStore((s) => s.formatAmount);
  const [summary, setSummary] = React.useState<MonthlySummary>({ total: 0, categories: [], expenseCount: 0 });
  const [recentExpenses, setRecentExpenses] = React.useState<ExpenseWithCategory[]>([]);

  const loadData = useCallback(() => {
    const summaryData = getMonthlySummary(currentMonth);
    setSummary(summaryData);
    setRecentExpenses(getRecentExpenses(5));
  }, [currentMonth]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="always">

        <SummaryCard
          total={summary.total}
          categories={summary.categories}
          month={currentMonth}
        />

        <View style={styles.section}>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onBackground, marginHorizontal: 16, marginBottom: 8 }}>
            Recent Expenses
          </Text>
          {recentExpenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No expenses yet. Tap + to add one!
              </Text>
            </View>
          ) : (
            recentExpenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                formattedAmount={formatAmount(expense.amount)}
                onPress={() => router.push(`/expense/${expense.id}` as any)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        icon="plus"
        style={[
          styles.fab,
          { backgroundColor: theme.colors.primary, bottom: insets.bottom - 32 },
        ]}
        color={theme.colors.onPrimary}
        onPress={() => router.push('/expense/add' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  section: {
    marginTop: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
});
