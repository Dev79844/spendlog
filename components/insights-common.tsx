import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

// Shared pieces of the Insights tab's month and trend views.

/** Short amount for chart axes: `₹1.2k`, `$3.4M`. Full amounts go through `formatAmount`. */
export function formatCompactAmount(symbol: string, amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const compact = (n: number, suffix: string) =>
    `${sign}${symbol}${Number(n.toFixed(n < 10 ? 1 : 0))}${suffix}`;
  if (abs >= 1e6) return compact(abs / 1e6, 'M');
  if (abs >= 1e3) return compact(abs / 1e3, 'k');
  return `${sign}${symbol}${Math.round(abs)}`;
}

export function InsightSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.colors.elevation.level1 }]}>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function InsightsEmptyState({ icon, title, message }: { icon: string; title: string; message: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon as any} size={56} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 12 }}>
        {title}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  );
}

/** A category row: colour dot, name, amount and share, with a bar for the share. */
export function CategoryShareRow({
  name,
  color,
  amount,
  percentage,
}: {
  name: string;
  color: string;
  amount: string;
  percentage: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareTop}>
        <View style={styles.shareName}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurface, flexShrink: 1 }}>
            {name}
          </Text>
        </View>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
          {amount}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {'  '}
            {formatPercent(percentage)}
          </Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.min(100, percentage)}%` }]} />
      </View>
    </View>
  );
}

export function formatPercent(percentage: number): string {
  if (percentage > 0 && percentage < 1) return '<1%';
  return `${Math.round(percentage)}%`;
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  sectionBody: {
    marginTop: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  shareRow: {
    marginBottom: 12,
  },
  shareTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  shareName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
