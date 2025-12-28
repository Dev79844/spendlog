import type { ExpenseWithCategory } from '@/lib/types';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface ExpenseCardProps {
  expense: ExpenseWithCategory;
  formattedAmount: string;
  onPress?: () => void;
}

function ExpenseCardComponent({ expense, formattedAmount, onPress }: ExpenseCardProps) {
  const theme = useTheme();

  const formattedDate = new Date(expense.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View
        style={[
          styles.categoryIndicator,
          { backgroundColor: expense.category_color ?? theme.colors.primary },
        ]}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            {expense.category_name}
          </Text>
          <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
            {formattedAmount}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formattedDate}
            {expense.location ? ` • ${expense.location}` : ''}
          </Text>
        </View>
        {expense.description && (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {expense.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Memoize to prevent unnecessary re-renders
export const ExpenseCard = memo(ExpenseCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.expense.id === nextProps.expense.id &&
    prevProps.expense.amount === nextProps.expense.amount &&
    prevProps.expense.category_name === nextProps.expense.category_name &&
    prevProps.expense.category_color === nextProps.expense.category_color &&
    prevProps.expense.date === nextProps.expense.date &&
    prevProps.expense.location === nextProps.expense.location &&
    prevProps.expense.description === nextProps.expense.description &&
    prevProps.formattedAmount === nextProps.formattedAmount
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  categoryIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
});
