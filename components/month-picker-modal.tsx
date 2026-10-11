import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { toMonthKey } from '@/lib/date';

interface MonthPickerModalProps {
  visible: boolean;
  selectedMonth: string;
  onSelect: (month: string) => void;
  onDismiss: () => void;
}

// The last 12 months, newest first.
function recentMonths() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = toMonthKey(date);
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    months.push({ value, label });
  }
  return months;
}

export function MonthPickerModal({ visible, selectedMonth, onSelect, onDismiss }: MonthPickerModalProps) {
  const theme = useTheme();
  // Built per render (cheap), so it follows the calendar if the app stays open across a month change.
  const availableMonths = recentMonths();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
        <Text variant="titleLarge" style={{ marginBottom: 16, color: theme.colors.onSurface }}>
          Select Month
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {availableMonths.map((month) => (
            <Pressable
              key={month.value}
              onPress={() => onSelect(month.value)}
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
                <MaterialCommunityIcons name="check" size={20} color={theme.colors.onPrimaryContainer} />
              )}
            </Pressable>
          ))}
        </ScrollView>
        <Button onPress={onDismiss} style={{ marginTop: 16 }}>
          Cancel
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
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
