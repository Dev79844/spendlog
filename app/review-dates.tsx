import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/lib/db';
import { getDateReviewItems, resolveDateReview, type DateReviewChoice } from '@/lib/db/date-review';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import type { DateReviewItem } from '@/lib/types';

const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatShortDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const formatTime = (ms: number) =>
  new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const REASONS: Record<DateReviewItem['reason'], string> = {
  'add-shifted':
    'Entered between midnight and the UTC offset, when the old app saved the day before (or after) the one shown.',
  'add-uncertain':
    'Entered close to midnight or to the UTC offset: it depends on when the screen was opened, which is not known.',
  edited:
    'Saved from the old edit screen, which could move the day by one on every save. It may have been corrected by hand.',
};

/**
 * Expenses whose day the old app may have stored one day off (see migration 2
 * in lib/db/migrations.ts). Pending entries get "keep" or "move"; automatic
 * fixes can be undone. Tapping an entry opens it for any other change.
 */
export default function ReviewDatesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loadExpenses } = useExpenseStore();
  const { formatAmount } = useSettingsStore();
  const [items, setItems] = useState<DateReviewItem[]>([]);

  const reload = useCallback(() => setItems(getDateReviewItems(db)), []);
  useFocusEffect(reload);

  const resolve = (item: DateReviewItem, choice: DateReviewChoice) => {
    try {
      resolveDateReview(db, item.id, choice);
    } catch (error) {
      Alert.alert('Not changed', (error as Error).message);
    }
    reload();
    loadExpenses();
  };

  const renderItem = ({ item }: { item: DateReviewItem }) => {
    const edited = item.updated_at !== item.created_at;
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Pressable
          onPress={() => router.push(`/expense/${item.id}` as any)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <View style={styles.topRow}>
            <View style={styles.categoryRow}>
              <View
                style={[styles.colorDot, { backgroundColor: item.category_color ?? theme.colors.primary }]}
              />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {item.category_name}
              </Text>
            </View>
            <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
              {formatAmount(item.amount)}
            </Text>
          </View>
          {(item.location || item.description) && (
            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
              {[item.location, item.description].filter(Boolean).join(' • ')}
            </Text>
          )}
          <View style={styles.details}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
              {item.status === 'fixed'
                ? `Moved from ${formatDay(item.original_date)} to ${formatDay(item.date)}`
                : `Date: ${formatDay(item.date)}`}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Entered {formatTime(item.created_at)}
              {edited ? ` · last edited ${formatTime(item.updated_at)}` : ''}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              {REASONS[item.reason]}
            </Text>
          </View>
        </Pressable>
        <View style={styles.actions}>
          {item.status === 'pending' ? (
            <>
              <Button mode="outlined" compact onPress={() => resolve(item, 'keep')} style={styles.action}>
                Keep
              </Button>
              <Button mode="contained" compact onPress={() => resolve(item, 'move')} style={styles.action}>
                {`Move to ${formatShortDay(item.suggested_date)}`}
              </Button>
            </>
          ) : (
            <Button mode="outlined" compact onPress={() => resolve(item, 'undo')} style={styles.action}>
              {`Undo: back to ${formatShortDay(item.original_date)}`}
            </Button>
          )}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      data={items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={
        <Text variant="bodyMedium" style={[styles.intro, { color: theme.colors.onSurfaceVariant }]}>
          {items.length === 0
            ? 'Nothing to review.'
            : 'Versions before 1.2 could save an expense one day off. Keep each date or move it, or tap an expense to pick another day. Expenses that were certainly off have been moved already; you can undo that.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  intro: {
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  details: {
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  action: {
    flexShrink: 1,
  },
});
