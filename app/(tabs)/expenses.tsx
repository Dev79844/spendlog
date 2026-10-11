import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Chip, FAB, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpenseCard } from '@/components/expense-card';
import { ExpenseListSkeleton } from '@/components/expense-skeleton';
import { MonthPickerModal } from '@/components/month-picker-modal';
import {
    getExpensesByMonthPaginated,
    getExpensesPaginated,
    type PaginatedExpenses,
} from '@/lib/db/expenses';
import { getIncomesByMonthPaginated, getIncomesPaginated } from '@/lib/db/incomes';
import { getCurrentMonth, monthKeyToDate, toDayKey } from '@/lib/date';
import { useRecurringStore } from '@/lib/stores/recurring-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { ExpenseWithCategory, IncomeWithCategory, TransactionKind } from '@/lib/types';

// Expenses and income are separate lists (a segment at the top), not one
// mixed list: each keeps its own count, day groups and pagination, and
// income is a handful of rows a month that would get lost among expenses.
type Row = ExpenseWithCategory | IncomeWithCategory;

type FilterMode = 'all' | 'month';

const PAGE_SIZE = 20;

// Pre-format date section headers
const formatSectionDate = (dateMs: number): string => {
  const date = new Date(dateMs);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  } else if (date.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }
};

// List item with section header support
interface ListItem {
  type: 'header' | 'expense';
  date?: string;
  title?: string;
  expense?: Row;
  formattedAmount?: string;
}

export default function ExpensesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const formatAmount = useSettingsStore((s) => s.formatAmount);

  const [kind, setKind] = useState<TransactionKind>('expense');
  const recurringGeneration = useRecurringStore((s) => s.generation);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  const offsetRef = useRef(0);
  const isFirstLoad = useRef(true);

  const loadData = useCallback(
    (reset = true) => {
      if (reset) {
        offsetRef.current = 0;
        if (isFirstLoad.current) {
          setIsLoading(true);
        }
      }

      const result: PaginatedExpenses | { data: IncomeWithCategory[]; hasMore: boolean; total: number } =
        kind === 'income'
          ? filterMode === 'all'
            ? getIncomesPaginated(PAGE_SIZE, offsetRef.current)
            : getIncomesByMonthPaginated(selectedMonth, PAGE_SIZE, offsetRef.current)
          : filterMode === 'all'
            ? getExpensesPaginated(PAGE_SIZE, offsetRef.current)
            : getExpensesByMonthPaginated(selectedMonth, PAGE_SIZE, offsetRef.current);

      if (reset) {
        setExpenses(result.data);
      } else {
        setExpenses((prev) => [...prev, ...(result.data as Row[])]);
      }

      setHasMore(result.hasMore);
      setTotal(result.total);
      offsetRef.current += result.data.length;
      setIsLoading(false);
      setIsLoadingMore(false);
      isFirstLoad.current = false;
    },
    // recurringGeneration: re-query when recurring entries were generated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterMode, selectedMonth, kind, recurringGeneration]
  );

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    loadData(false);
  }, [isLoadingMore, hasMore, loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [loadData])
  );

  const handleFilterChange = useCallback(
    (mode: FilterMode) => {
      if (mode === filterMode) return;
      setFilterMode(mode);
    },
    [filterMode]
  );

  const handleMonthSelect = useCallback((month: string) => {
    setSelectedMonth(month);
    setFilterMode('month');
    setMonthPickerVisible(false);
  }, []);

  const selectedMonthLabel = useMemo(() => {
    const date = monthKeyToDate(selectedMonth);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [selectedMonth]);

  // Convert expenses to flat list with section headers
  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let currentDay = '';

    expenses.forEach((expense) => {
      const day = toDayKey(expense.date);
      if (day !== currentDay) {
        currentDay = day;
        items.push({
          type: 'header',
          date: day,
          title: formatSectionDate(expense.date),
        });
      }
      items.push({
        type: 'expense',
        expense,
        formattedAmount: formatAmount(expense.amount),
      });
    });

    return items;
  }, [expenses, formatAmount]);

  const handleExpensePress = useCallback(
    (id: number) => {
      router.push((kind === 'income' ? `/expense/${id}?kind=income` : `/expense/${id}`) as any);
    },
    [router, kind]
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'header') {
        return (
          <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.title}
            </Text>
          </View>
        );
      }

      return (
        <ExpenseCard
          expense={item.expense!}
          formattedAmount={item.formattedAmount!}
          income={kind === 'income'}
          onPress={() => handleExpensePress(item.expense!.id)}
        />
      );
    },
    [theme.colors, handleExpensePress, kind]
  );

  const keyExtractor = useCallback(
    (item: ListItem, index: number) =>
      item.type === 'header' ? `header-${item.date}` : `expense-${item.expense!.id}`,
    []
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 76,
      offset: 76 * index,
      index,
    }),
    []
  );

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text variant="headlineSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {kind === 'income' ? 'No income' : 'No expenses'}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
          {filterMode === 'month'
            ? `No ${kind === 'income' ? 'income' : 'expenses'} in ${selectedMonthLabel}`
            : `Tap the + button to add your first ${kind}`}
        </Text>
      </View>
    ),
    [theme.colors, filterMode, selectedMonthLabel, kind]
  );

  const ListHeaderComponent = useMemo(
    () => (
      <Text variant="bodySmall" style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
        {expenses.length} of {total} {kind === 'income' ? 'income entr' : 'expense'}
        {kind === 'income' ? (total !== 1 ? 'ies' : 'y') : total !== 1 ? 's' : ''}
      </Text>
    ),
    [expenses.length, total, theme.colors, kind]
  );

  const ListFooterComponent = useMemo(() => {
    if (!hasMore || expenses.length === 0) return null;
    return (
      <View style={styles.loadingMore}>
        {isLoadingMore ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Scroll for more
          </Text>
        )}
      </View>
    );
  }, [hasMore, isLoadingMore, expenses.length, theme.colors]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        value={kind}
        onValueChange={(value) => setKind(value as TransactionKind)}
        buttons={[
          { value: 'expense', label: 'Expenses', icon: 'cash-minus' },
          { value: 'income', label: 'Income', icon: 'cash-plus' },
        ]}
        style={styles.kind}
      />

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <Chip
          selected={filterMode === 'all'}
          onPress={() => handleFilterChange('all')}
          style={styles.chip}
          showSelectedOverlay>
          All Time
        </Chip>
        <Chip
          selected={filterMode === 'month'}
          onPress={() => {
            handleFilterChange('month');
            setMonthPickerVisible(true);
          }}
          style={styles.chip}
          showSelectedOverlay
          icon={filterMode === 'month' ? 'calendar' : undefined}>
          {filterMode === 'month' ? selectedMonthLabel : 'By Month'}
        </Chip>
        {filterMode === 'month' && (
          <Pressable onPress={() => setMonthPickerVisible(true)} style={styles.monthSelector}>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.primary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ExpenseListSkeleton count={8} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={ListEmptyComponent}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{
            paddingBottom: 120 + insets.bottom,
            flexGrow: 1,
          }}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={20}
          updateCellsBatchingPeriod={30}
          getItemLayout={getItemLayout}
          // Disable scroll momentum for smoother experience
          decelerationRate="fast"
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: 32 + insets.bottom }]}
        color={theme.colors.onPrimary}
        onPress={() => router.push(`/expense/add?kind=${kind}` as any)}
      />

      <MonthPickerModal
        visible={monthPickerVisible}
        selectedMonth={selectedMonth}
        onSelect={handleMonthSelect}
        onDismiss={() => setMonthPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kind: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    marginRight: 4,
  },
  monthSelector: {
    marginLeft: -8,
  },
  countText: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    opacity: 0.6,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
});
