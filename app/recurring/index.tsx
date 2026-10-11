import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Divider, FAB, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeFrequency, nextOccurrence, today } from '@/lib/recurrence';
import { useRecurringStore } from '@/lib/stores/recurring-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { RecurringRuleWithCategory } from '@/lib/types';

const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function statusLine(rule: RecurringRuleWithCategory): string {
  const schedule = describeFrequency(rule.frequency, rule.interval);
  if (rule.is_active !== 1) return `${schedule} · paused`;
  const next = nextOccurrence(rule, Math.max(today() - 1, rule.last_occurrence ?? 0));
  return next === null ? `${schedule} · ended` : `${schedule} · next ${formatDay(next)}`;
}

export default function RecurringScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rules, loadRules } = useRecurringStore();
  const formatAmount = useSettingsStore((s) => s.formatAmount);

  useFocusEffect(
    useCallback(() => {
      loadRules();
    }, [loadRules])
  );

  const sections = [
    { title: 'Income', rules: rules.filter((r) => r.kind === 'income') },
    { title: 'Expenses', rules: rules.filter((r) => r.kind === 'expense') },
  ].filter((s) => s.rules.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <Text variant="bodySmall" style={[styles.intro, { color: theme.colors.onSurfaceVariant }]}>
          Rent, subscriptions, salary: each rule adds a normal entry on its dates. Entries are added
          when you open the app, including any dates missed while it was closed.
        </Text>

        {sections.length === 0 && (
          <View style={styles.emptyState}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No recurring entries yet. Tap + to add one.
            </Text>
          </View>
        )}

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
              {section.title}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              {section.rules.map((rule, index) => (
                <React.Fragment key={rule.id}>
                  <Pressable
                    onPress={() => router.push(`/recurring/${rule.id}` as any)}
                    style={({ pressed }) => [
                      styles.item,
                      { opacity: pressed ? 0.7 : rule.is_active === 1 ? 1 : 0.6 },
                    ]}>
                    <View
                      style={[styles.colorDot, { backgroundColor: rule.category_color ?? theme.colors.primary }]}
                    />
                    <View style={styles.itemText}>
                      <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }} numberOfLines={1}>
                        {rule.description || rule.category_name || 'Recurring'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {statusLine(rule)}
                      </Text>
                    </View>
                    <Text
                      variant="titleSmall"
                      style={{
                        color: rule.kind === 'income' ? theme.colors.tertiary : theme.colors.primary,
                        fontWeight: '600',
                      }}>
                      {rule.kind === 'income' ? '+' : ''}
                      {formatAmount(rule.amount)}
                    </Text>
                    <MaterialCommunityIcons
                      name={rule.is_active === 1 ? 'chevron-right' : 'pause'}
                      size={22}
                      color={theme.colors.onSurfaceVariant}
                    />
                  </Pressable>
                  {index < section.rules.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: 32 + insets.bottom }]}
        color={theme.colors.onPrimary}
        onPress={() => router.push('/recurring/add' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  intro: {
    padding: 16,
    paddingBottom: 0,
  },
  section: {
    padding: 16,
    paddingBottom: 0,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingLeft: 16,
  },
  itemText: {
    flex: 1,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
});
