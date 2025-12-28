import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, FAB, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpenseCard } from '@/components/expense-card';
import { ExpenseListSkeleton } from '@/components/expense-skeleton';
import {
    getExpensesByMonthPaginated,
    getExpensesPaginated,
    type PaginatedExpenses,
} from '@/lib/db/expenses';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { ExpenseWithCategory } from '@/lib/types';

type FilterMode = 'all' | 'month';

const PAGE_SIZE = 20;

// Pre-format date section headers
const formatSectionDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
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
  expense?: ExpenseWithCategory;
  formattedAmount?: string;
}

export default function ExpensesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const formatAmount = useSettingsStore((s) => s.formatAmount);

  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
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

      const result: PaginatedExpenses =
        filterMode === 'all'
          ? getExpensesPaginated(PAGE_SIZE, offsetRef.current)
          : getExpensesByMonthPaginated(selectedMonth, PAGE_SIZE, offsetRef.current);

      if (reset) {
        setExpenses(result.data);
      } else {
        setExpenses((prev) => [...prev, ...result.data]);
      }

      setHasMore(result.hasMore);
      setTotal(result.total);
      offsetRef.current += result.data.length;
      setIsLoading(false);
      setIsLoadingMore(false);
      isFirstLoad.current = false;
    },
    [filterMode, selectedMonth]
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

  const availableMonths = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      months.push({ value, label });
    }
    return months;
  }, []);

  const selectedMonthLabel = useMemo(() => {
    const date = new Date(selectedMonth + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [selectedMonth]);

  // Convert expenses to flat list with section headers
  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let currentDate = '';

    expenses.forEach((expense) => {
      if (expense.date !== currentDate) {
        currentDate = expense.date;
        items.push({
          type: 'header',
          date: currentDate,
          title: formatSectionDate(currentDate),
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
      router.push(`/expense/${id}` as any);
    },
    [router]
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
          onPress={() => handleExpensePress(item.expense!.id)}
        />
      );
    },
    [theme.colors, handleExpensePress]
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
          No expenses
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
          {filterMode === 'month'
            ? `No expenses in ${selectedMonthLabel}`
            : 'Tap the + button to add your first expense'}
        </Text>
      </View>
    ),
    [theme.colors, filterMode, selectedMonthLabel]
  );

  const ListHeaderComponent = useMemo(
    () => (
      <Text variant="bodySmall" style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
        {expenses.length} of {total} expense{total !== 1 ? 's' : ''}
      </Text>
    ),
    [expenses.length, total, theme.colors]
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
        onPress={() => router.push('/expense/add' as any)}
      />

      {/* Month Picker Modal */}
      <Portal>
        <Modal
          visible={monthPickerVisible}
          onDismiss={() => setMonthPickerVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ marginBottom: 16, color: theme.colors.onSurface }}>
            Select Month
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {availableMonths.map((month) => (
              <Pressable
                key={month.value}
                onPress={() => handleMonthSelect(month.value)}
                style={({ pressed }) => [
                  styles.monthItem,
                  {
                    backgroundColor:
                      month.value === selectedMonth
                        ? theme.colors.primaryContainer
                        : pressed
                        ? theme.colors.surfaceVariant
                        : 'transparent',
                  },
                ]}>
                <Text
                  variant="bodyLarge"
                  style={{
                    color:
                      month.value === selectedMonth
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurface,
                  }}>
                  {month.label}
                </Text>
                {month.value === selectedMonth && (
                  <MaterialCommunityIcons
                    name="check"
                    size={20}
                    color={theme.colors.onPrimaryContainer}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>
          <Button onPress={() => setMonthPickerVisible(false)} style={{ marginTop: 16 }}>
            Cancel
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  modal: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: '60%',
    alignSelf: 'center',
  },
  monthItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
  },
});
