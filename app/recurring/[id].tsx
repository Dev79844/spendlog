import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { RecurringRuleForm } from '@/components/recurring-rule-form';
import { useRecurringStore } from '@/lib/stores/recurring-store';

export default function EditRecurringScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rules, updateRule, setRuleActive, deleteRule } = useRecurringStore();
  const rule = rules.find((r) => r.id === Number(id));

  if (!rule) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.colors.background }]}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          This rule no longer exists.
        </Text>
      </View>
    );
  }

  const active = rule.is_active === 1;

  const handleDelete = () => {
    Alert.alert(
      'Delete Recurring Rule',
      'Stop repeating this entry? Entries it already added are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRule(rule.id);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <RecurringRuleForm
      rule={rule}
      onSubmit={async (input) => {
        await updateRule(rule.id, input);
      }}
      footer={
        <View style={styles.footer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Changes apply to dates after the last one already added. Entries already added stay as they are.
          </Text>
          <Button
            mode="outlined"
            icon={active ? 'pause' : 'play'}
            onPress={async () => {
              await setRuleActive(rule.id, !active);
              router.back();
            }}>
            {active ? 'Pause' : 'Resume (skips the paused dates)'}
          </Button>
          <Button
            mode="outlined"
            onPress={handleDelete}
            textColor={theme.colors.error}
            style={{ borderColor: theme.colors.error }}>
            Delete Rule
          </Button>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
  },
  footer: {
    marginTop: 24,
    gap: 12,
  },
});
