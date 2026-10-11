import { monthKeyToDate } from '@/lib/date';
import type { CategorySummary } from '@/lib/types';
import { useSettingsStore } from '@/lib/stores/settings-store';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';

interface SummaryCardProps {
  total: number;
  categories: CategorySummary[];
  month: string;
}

export function SummaryCard({ total, categories, month }: SummaryCardProps) {
  const theme = useTheme();
  const formatAmount = useSettingsStore((s) => s.formatAmount);

  const monthName = monthKeyToDate(month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const topCategories = categories.slice(0, 4);

  return (
    <Surface style={[styles.container, { backgroundColor: theme.colors.primaryContainer }]} elevation={2}>
      <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer }}>
        {monthName}
      </Text>
      <Text variant="displaySmall" style={[styles.total, { color: theme.colors.onPrimaryContainer }]}>
        {formatAmount(total)}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
        Total spent this month
      </Text>

      {topCategories.length > 0 && (
        <View style={styles.categoriesContainer}>
          {topCategories.map((cat) => (
            <View key={cat.category_id} style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: cat.category_color ?? theme.colors.primary },
                  ]}
                />
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onPrimaryContainer }}
                  numberOfLines={1}>
                  {cat.category_name}
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                {formatAmount(cat.total)} ({cat.percentage}%)
              </Text>
            </View>
          ))}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  total: {
    fontWeight: 'bold',
    marginVertical: 8,
  },
  categoriesContainer: {
    marginTop: 16,
    gap: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
