import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InsightsMonthView } from '@/components/insights-month-view';
import { InsightsTrendView } from '@/components/insights-trend-view';
import { MonthPickerModal } from '@/components/month-picker-modal';
import { getCurrentMonth, monthKeyToDate, shiftMonth } from '@/lib/date';
import { db } from '@/lib/db';
import {
  getMonthInsights,
  getSpendingTrend,
  type MonthInsights,
  type SpendingTrend,
} from '@/lib/db/insights';

type InsightsMode = 'month' | 'trend';

export default function InsightsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<InsightsMode>('month');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [monthInsights, setMonthInsights] = useState<MonthInsights | null>(null);
  const [trend, setTrend] = useState<SpendingTrend | null>(null);

  // Read-heavy screen: query on focus (expenses may have changed elsewhere) and on every change.
  useFocusEffect(
    useCallback(() => {
      if (view === 'month') {
        setMonthInsights(getMonthInsights(db, selectedMonth));
      } else {
        setTrend(getSpendingTrend(db, getCurrentMonth()));
      }
    }, [view, selectedMonth])
  );

  const isCurrentMonth = selectedMonth >= getCurrentMonth();
  const monthLabel = monthKeyToDate(selectedMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as InsightsMode)}
          buttons={[
            { value: 'month', label: 'Month', icon: 'calendar-month' },
            { value: 'trend', label: 'Trend', icon: 'chart-bar' },
          ]}
          style={styles.viewSwitch}
        />

        {view === 'month' ? (
          <>
            <View style={styles.monthSwitcher}>
              <IconButton
                icon="chevron-left"
                accessibilityLabel="Previous month"
                onPress={() => setSelectedMonth((m) => shiftMonth(m, -1))}
              />
              <Pressable
                onPress={() => setMonthPickerVisible(true)}
                style={styles.monthLabel}
                accessibilityRole="button"
                accessibilityLabel={`${monthLabel}, choose month`}>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                  {monthLabel}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.primary} />
              </Pressable>
              <IconButton
                icon="chevron-right"
                accessibilityLabel="Next month"
                disabled={isCurrentMonth}
                onPress={() => setSelectedMonth((m) => shiftMonth(m, 1))}
              />
            </View>
            {monthInsights?.month === selectedMonth && (
              <InsightsMonthView key={selectedMonth} insights={monthInsights} />
            )}
          </>
        ) : (
          trend && <InsightsTrendView trend={trend} />
        )}
      </ScrollView>

      <MonthPickerModal
        visible={monthPickerVisible}
        selectedMonth={selectedMonth}
        onSelect={(month) => {
          setSelectedMonth(month);
          setMonthPickerVisible(false);
        }}
        onDismiss={() => setMonthPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewSwitch: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 4,
    marginVertical: 4,
  },
  monthLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
