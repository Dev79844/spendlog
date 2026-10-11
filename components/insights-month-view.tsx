import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { Text, useTheme } from 'react-native-paper';

import {
  CategoryShareRow,
  formatCompactAmount,
  formatPercent,
  InsightSection,
  InsightsEmptyState,
} from '@/components/insights-common';
import { monthKeyToDate } from '@/lib/date';
import type { MonthInsights } from '@/lib/db/insights';
import { useSettingsStore } from '@/lib/stores/settings-store';

const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  monthKeyToDate(month).toLocaleDateString('en-US', { month: style, year: 'numeric' });

export function InsightsMonthView({ insights }: { insights: MonthInsights }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const formatAmount = useSettingsStore((s) => s.formatAmount);
  const symbol = useSettingsStore((s) => s.currency.symbol);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [focusedSlice, setFocusedSlice] = useState<number | null>(null);

  const categoryColor = (color: string | null) => color ?? theme.colors.outline;

  const pieData = useMemo(
    () =>
      insights.categories.map((c, i) => ({
        value: c.total,
        color: c.category_color ?? theme.colors.outline,
        focused: i === focusedSlice,
        onPress: () => setFocusedSlice((f) => (f === i ? null : i)),
      })),
    [insights.categories, focusedSlice, theme.colors.outline]
  );

  const maxDay = Math.max(0, ...insights.daily.map((d) => d.expenses));
  const barData = useMemo(
    () =>
      insights.daily.map((d) => ({
        value: d.expenses,
        label: d.day === 1 || d.day % 5 === 0 ? String(d.day) : '',
        frontColor: d.day === selectedDay ? theme.colors.tertiary : theme.colors.primary,
        onPress: () => setSelectedDay((s) => (s === d.day ? null : d.day)),
      })),
    [insights.daily, selectedDay, theme.colors.primary, theme.colors.tertiary]
  );

  // Income, spending and what is left, for the month. Shown whenever there is income.
  const net = insights.net;
  const incomeRow = insights.incomeCount > 0 && (
    <View style={styles.stats}>
      <Stat label="Income" value={formatAmount(insights.income)} />
      <Stat
        label={net < 0 ? 'Net (over)' : 'Net saved'}
        value={`${net < 0 ? '−' : ''}${formatAmount(Math.abs(net))}`}
        color={net < 0 ? theme.colors.error : undefined}
      />
      <Stat
        label="Saved"
        value={insights.income > 0 && net > 0 ? formatPercent((net * 100) / insights.income) : '—'}
      />
    </View>
  );

  if (insights.expenseCount === 0) {
    return (
      <>
        {insights.incomeCount > 0 && (
          <InsightSection title={`Income in ${monthName(insights.month)}`}>
            <Text variant="headlineMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
              {formatAmount(insights.income)}
            </Text>
            {incomeRow}
          </InsightSection>
        )}
        {insights.previousExpenses > 0 && (
          <InsightSection title={monthName(insights.month)}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {monthName(insights.previousMonth)}: {formatAmount(insights.previousExpenses)}
            </Text>
          </InsightSection>
        )}
        <InsightsEmptyState
          icon="chart-donut"
          title="No expenses"
          message={`Nothing recorded in ${monthName(insights.month)}. Add expenses to see where your money goes.`}
        />
      </>
    );
  }

  // Section padding (16) and screen margins (16) on each side, minus the y-axis labels.
  const yAxisLabelWidth = 44;
  const chartWidth = width - 64 - yAxisLabelWidth;
  const days = insights.daily.length;
  const barWidth = Math.max(3, Math.floor((chartWidth / days) * 0.6));
  const spacing = Math.max(1, (chartWidth - barWidth * days) / days);
  const focused = focusedSlice !== null ? insights.categories[focusedSlice] : undefined;
  const selected = selectedDay !== null ? insights.daily[selectedDay - 1] : undefined;
  const up = insights.change > 0;

  return (
    <>
      <InsightSection title={`Spent in ${monthName(insights.month)}`}>
        <Text variant="headlineMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
          {formatAmount(insights.expenses)}
        </Text>
        <View style={styles.changeRow}>
          {insights.change !== 0 && (
            <MaterialCommunityIcons
              name={up ? 'arrow-up' : 'arrow-down'}
              size={16}
              color={up ? theme.colors.error : theme.colors.primary}
            />
          )}
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flexShrink: 1 }}>
            {insights.changePercent === null
              ? `Nothing spent in ${monthName(insights.previousMonth, 'short')}`
              : insights.change === 0
              ? `Same as ${monthName(insights.previousMonth, 'short')}`
              : `${formatAmount(Math.abs(insights.change))} (${formatPercent(
                  Math.abs(insights.changePercent)
                )}) ${up ? 'more' : 'less'} than ${monthName(insights.previousMonth, 'short')}`}
          </Text>
        </View>
        <View style={styles.stats}>
          <Stat label="Daily average" value={formatAmount(insights.dailyAverage)} />
          <Stat label="Expenses" value={String(insights.expenseCount)} />
          <Stat label={monthName(insights.previousMonth, 'short')} value={formatAmount(insights.previousExpenses)} />
        </View>
        {incomeRow}
      </InsightSection>

      <InsightSection title="By category" subtitle="Tap a slice to highlight it">
        <View style={styles.pie}>
          <PieChart
            data={pieData}
            donut
            radius={96}
            innerRadius={64}
            innerCircleColor={theme.colors.elevation.level1}
            focusOnPress={false}
            centerLabelComponent={() => (
              <View style={styles.pieCenter}>
                <Text variant="labelMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                  {focused ? focused.category_name : 'Total'}
                </Text>
                <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                  {formatCompactAmount(symbol, focused ? focused.total : insights.expenses)}
                </Text>
                {focused && (
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatPercent(focused.percentage)}
                  </Text>
                )}
              </View>
            )}
          />
        </View>
        <Text variant="titleSmall" style={[styles.subheading, { color: theme.colors.onSurface }]}>
          Top categories
        </Text>
        {insights.categories.map((c) => (
          <CategoryShareRow
            key={c.category_id}
            name={c.category_name}
            color={categoryColor(c.category_color)}
            amount={formatAmount(c.total)}
            percentage={c.percentage}
          />
        ))}
      </InsightSection>

      <InsightSection
        title="Daily spending"
        subtitle={
          selected
            ? `${monthKeyToDate(insights.month).toLocaleDateString('en-US', { month: 'short' })} ${
                selected.day
              }: ${formatAmount(selected.expenses)}`
            : 'Tap a bar to see the day'
        }>
        <BarChart
          data={barData}
          width={chartWidth}
          height={160}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={spacing / 2}
          endSpacing={0}
          disableScroll
          noOfSections={3}
          maxValue={maxDay > 0 ? maxDay * 1.1 : 1}
          barBorderTopLeftRadius={2}
          barBorderTopRightRadius={2}
          yAxisLabelWidth={yAxisLabelWidth}
          formatYLabel={(label: string) => formatCompactAmount(symbol, Number(label))}
          yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10, width: 24 }}
          labelWidth={24}
          yAxisThickness={0}
          xAxisColor={theme.colors.outlineVariant}
          rulesColor={theme.colors.outlineVariant}
          rulesType="dashed"
        />
      </InsightSection>

      <InsightSection title="Largest expenses">
        {insights.largest.map((e) => (
          <View key={e.id} style={styles.largestRow}>
            <View style={[styles.iconBubble, { backgroundColor: categoryColor(e.category_color) }]}>
              <MaterialCommunityIcons name={(e.category_icon ?? 'tag') as any} size={16} color="#FFFFFF" />
            </View>
            <View style={styles.largestText}>
              <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                {e.description || e.category_name}
              </Text>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {e.description ? ` • ${e.category_name}` : ''}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
              {formatAmount(e.amount)}
            </Text>
          </View>
        ))}
      </InsightSection>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="bodyMedium" numberOfLines={1} adjustsFontSizeToFit style={{ color: color ?? theme.colors.onSurface }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  stats: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  stat: {
    flex: 1,
  },
  pie: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pieCenter: {
    alignItems: 'center',
    maxWidth: 110,
  },
  subheading: {
    marginBottom: 8,
  },
  largestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largestText: {
    flex: 1,
  },
});
