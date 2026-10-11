import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Chip, Text, useTheme } from 'react-native-paper';

import {
  CategoryShareRow,
  formatCompactAmount,
  InsightSection,
  InsightsEmptyState,
} from '@/components/insights-common';
import { monthKeyToDate } from '@/lib/date';
import type { SpendingTrend } from '@/lib/db/insights';
import { useSettingsStore } from '@/lib/stores/settings-store';

const shortMonth = (month: string) => monthKeyToDate(month).toLocaleDateString('en-US', { month: 'short' });
const longMonth = (month: string) =>
  monthKeyToDate(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

interface MonthlyBarsProps {
  months: string[];
  values: number[];
  color: string;
  /** Colour of the selected bar; defaults to the theme's tertiary. */
  highlight?: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
}

function MonthlyBars({ months, values, color, highlight, selected, onSelect }: MonthlyBarsProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const symbol = useSettingsStore((s) => s.currency.symbol);

  const yAxisLabelWidth = 44;
  const chartWidth = width - 64 - yAxisLabelWidth;
  const slot = chartWidth / months.length;
  const barWidth = Math.floor(slot * 0.6);
  const max = Math.max(0, ...values);

  const data = months.map((m, i) => ({
    value: values[i],
    // Twelve labels don't fit: label every other month, counting back from the latest.
    label: (months.length - 1 - i) % 2 === 0 ? shortMonth(m) : '',
    frontColor: i === selected ? (highlight ?? theme.colors.tertiary) : color,
    onPress: () => onSelect(i === selected ? null : i),
  }));

  return (
    <BarChart
      data={data}
      width={chartWidth}
      height={170}
      barWidth={barWidth}
      spacing={slot - barWidth}
      initialSpacing={(slot - barWidth) / 2}
      endSpacing={0}
      disableScroll
      noOfSections={4}
      maxValue={max > 0 ? max * 1.1 : 1}
      barBorderTopLeftRadius={4}
      barBorderTopRightRadius={4}
      yAxisLabelWidth={yAxisLabelWidth}
      formatYLabel={(label: string) => formatCompactAmount(symbol, Number(label))}
      yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
      xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10, width: slot * 2 }}
      labelWidth={slot * 2}
      yAxisThickness={0}
      xAxisColor={theme.colors.outlineVariant}
      rulesColor={theme.colors.outlineVariant}
      rulesType="dashed"
    />
  );
}

export function InsightsTrendView({ trend }: { trend: SpendingTrend }) {
  const theme = useTheme();
  const formatAmount = useSettingsStore((s) => s.formatAmount);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedCategoryMonth, setSelectedCategoryMonth] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectedIncomeMonth, setSelectedIncomeMonth] = useState<number | null>(null);

  const monthCount = trend.months.length;
  const totals = useMemo(() => trend.totals.map((t) => t.expenses), [trend.totals]);
  const incomes = useMemo(() => trend.totals.map((t) => t.income), [trend.totals]);
  const periodTotal = totals.reduce((a, b) => a + b, 0);
  const periodIncome = incomes.reduce((a, b) => a + b, 0);
  const periodNet = periodIncome - periodTotal;
  const activeMonths = totals.filter((t) => t > 0).length;
  const category = trend.categories.find((c) => c.category_id === categoryId) ?? trend.categories[0];

  const signed = (amount: number) => `${amount < 0 ? '−' : ''}${formatAmount(Math.abs(amount))}`;
  const selectedIncome = selectedIncomeMonth !== null ? trend.totals[selectedIncomeMonth] : undefined;
  const incomeSection = periodIncome > 0 && (
    <InsightSection
      title="Income and net"
      subtitle={
        selectedIncome
          ? `${longMonth(selectedIncome.month)}: ${formatAmount(selectedIncome.income)} in, net ${signed(
              selectedIncome.net
            )}`
          : 'Tap a bar to see the month'
      }>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Income
          </Text>
          <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.colors.onSurface }}>
            {formatAmount(periodIncome)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {periodNet < 0 ? 'Net (over)' : 'Net saved'}
          </Text>
          <Text
            variant="titleMedium"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: periodNet < 0 ? theme.colors.error : theme.colors.onSurface }}>
            {signed(periodNet)}
          </Text>
        </View>
      </View>
      <MonthlyBars
        months={trend.months}
        values={incomes}
        color={theme.colors.tertiary}
        highlight={theme.colors.primary}
        selected={selectedIncomeMonth}
        onSelect={setSelectedIncomeMonth}
      />
    </InsightSection>
  );

  if (periodTotal === 0 && periodIncome > 0) return <>{incomeSection}</>;

  if (periodTotal === 0) {
    return (
      <InsightsEmptyState
        icon="chart-bar"
        title="No expenses"
        message={`Nothing recorded in the last ${monthCount} months.`}
      />
    );
  }

  const selected = selectedMonth !== null ? trend.totals[selectedMonth] : undefined;
  const categoryColor = category.category_color ?? theme.colors.outline;

  return (
    <>
      <InsightSection
        title={`Last ${monthCount} months`}
        subtitle={
          selected
            ? `${longMonth(selected.month)}: ${formatAmount(selected.expenses)}`
            : 'Tap a bar to see the month'
        }>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Total
            </Text>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.colors.onSurface }}>
              {formatAmount(periodTotal)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Monthly average
            </Text>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.colors.onSurface }}>
              {formatAmount(periodTotal / Math.max(1, activeMonths))}
            </Text>
          </View>
        </View>
        <MonthlyBars
          months={trend.months}
          values={totals}
          color={theme.colors.primary}
          selected={selectedMonth}
          onSelect={setSelectedMonth}
        />
        {activeMonths < monthCount && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            Average over the {activeMonths} month{activeMonths === 1 ? '' : 's'} with expenses.
          </Text>
        )}
      </InsightSection>

      {incomeSection}

      <InsightSection
        title="By category"
        subtitle={
          selectedCategoryMonth !== null
            ? `${category.category_name}, ${longMonth(trend.months[selectedCategoryMonth])}: ${formatAmount(
                category.monthly[selectedCategoryMonth]
              )}`
            : `${category.category_name}: ${formatAmount(category.total)} in ${monthCount} months`
        }>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {trend.categories.map((c) => (
            <Chip
              key={c.category_id}
              selected={c.category_id === category.category_id}
              showSelectedOverlay
              compact
              onPress={() => {
                setCategoryId(c.category_id);
                setSelectedCategoryMonth(null);
              }}>
              {c.category_name}
            </Chip>
          ))}
        </ScrollView>
        <MonthlyBars
          months={trend.months}
          values={category.monthly}
          color={categoryColor}
          selected={selectedCategoryMonth}
          onSelect={setSelectedCategoryMonth}
        />
      </InsightSection>

      <InsightSection title="Category totals" subtitle={`Last ${monthCount} months`}>
        {trend.categories.map((c) => (
          <CategoryShareRow
            key={c.category_id}
            name={c.category_name}
            color={c.category_color ?? theme.colors.outline}
            amount={formatAmount(c.total)}
            percentage={(c.total * 100) / periodTotal}
          />
        ))}
      </InsightSection>
    </>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
  },
  chips: {
    gap: 8,
    paddingBottom: 12,
  },
});
