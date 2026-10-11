import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FAB, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpenseCard } from '@/components/expense-card';
import { SummaryCard } from '@/components/summary-card';
import { getMonthlySummary, getRecentExpenses } from '@/lib/db/expenses';
import { getMonthlyIncomeTotal, getRecentIncomes } from '@/lib/db/incomes';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { useRecurringStore } from '@/lib/stores/recurring-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { ExpenseWithCategory, IncomeWithCategory, MonthlySummary } from '@/lib/types';

const RECENT_COUNT = 5;

type RecentItem =
  | { kind: 'expense'; row: ExpenseWithCategory }
  | { kind: 'income'; row: IncomeWithCategory };

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentMonth } = useExpenseStore();
  const formatAmount = useSettingsStore((s) => s.formatAmount);
  // Changes when recurring entries were generated while this screen is open.
  const recurringGeneration = useRecurringStore((s) => s.generation);
  const [summary, setSummary] = React.useState<MonthlySummary>({ total: 0, categories: [], expenseCount: 0 });
  const [income, setIncome] = React.useState(0);
  const [recent, setRecent] = React.useState<RecentItem[]>([]);

  const loadData = useCallback(() => {
    setSummary(getMonthlySummary(currentMonth));
    setIncome(getMonthlyIncomeTotal(currentMonth));
    // Newest of both kinds, merged.
    const items: RecentItem[] = [
      ...getRecentExpenses(RECENT_COUNT).map((row) => ({ kind: 'expense' as const, row })),
      ...getRecentIncomes(RECENT_COUNT).map((row) => ({ kind: 'income' as const, row })),
    ];
    items.sort((a, b) => b.row.date - a.row.date || b.row.created_at - a.row.created_at);
    setRecent(items.slice(0, RECENT_COUNT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, recurringGeneration]);

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
          income={income}
          categories={summary.categories}
          month={currentMonth}
        />

        <View style={styles.section}>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onBackground, marginHorizontal: 16, marginBottom: 8 }}>
            Recent Activity
          </Text>
          {recent.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No expenses yet. Tap + to add one!
              </Text>
            </View>
          ) : (
            recent.map((item) => (
              <ExpenseCard
                key={`${item.kind}-${item.row.id}`}
                expense={item.row}
                income={item.kind === 'income'}
                formattedAmount={formatAmount(item.row.amount)}
                onPress={() =>
                  router.push(
                    (item.kind === 'income'
                      ? `/expense/${item.row.id}?kind=income`
                      : `/expense/${item.row.id}`) as any
                  )
                }
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
