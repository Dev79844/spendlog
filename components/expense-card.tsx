import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ExpenseWithCategory, IncomeWithCategory } from '@/lib/types';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

// Shows an expense, or an income entry (`income`: "+" amount in the income color).
interface ExpenseCardProps {
  expense: ExpenseWithCategory | (IncomeWithCategory & { location?: null });
  formattedAmount: string;
  income?: boolean;
  onPress?: () => void;
}

function ExpenseCardComponent({ expense, formattedAmount, income = false, onPress }: ExpenseCardProps) {
  const theme = useTheme();
  const amountColor = income ? theme.colors.tertiary : theme.colors.primary;

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
          <View style={styles.title}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }} numberOfLines={1}>
              {expense.category_name}
            </Text>
            {expense.recurring_rule_id !== null && (
              <MaterialCommunityIcons name="repeat" size={14} color={theme.colors.onSurfaceVariant} />
            )}
          </View>
          <Text variant="titleMedium" style={{ color: amountColor, fontWeight: '600' }}>
            {income ? `+${formattedAmount}` : formattedAmount}
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
    prevProps.expense.recurring_rule_id === nextProps.expense.recurring_rule_id &&
    prevProps.formattedAmount === nextProps.formattedAmount &&
    prevProps.income === nextProps.income
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
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
});
