import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '@/components/amount-input';
import { CategoryPicker } from '@/components/category-picker';
import { toExpenseDay } from '@/lib/date';
import { describeFrequency, nextOccurrence, today } from '@/lib/recurrence';
import { useCategoryStore } from '@/lib/stores/category-store';
import type { Frequency, RecurringRule, RecurringRuleInput, TransactionKind } from '@/lib/types';

const FREQUENCY_BUTTONS: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const formatDay = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

interface RecurringRuleFormProps {
  /** The rule being edited; omitted when adding. */
  rule?: RecurringRule;
  initialKind?: TransactionKind;
  /** Prefill when adding. */
  initialValues?: Partial<Pick<RecurringRuleInput, 'amount' | 'category_id' | 'description' | 'location' | 'start_date'>>;
  onSubmit: (input: RecurringRuleInput) => Promise<void>;
  /** Extra controls under the Save button (pause, delete). */
  footer?: React.ReactNode;
}

/** Add/edit form for a recurring expense or income rule. */
export function RecurringRuleForm({
  rule,
  initialKind = 'expense',
  initialValues = {},
  onSubmit,
  footer,
}: RecurringRuleFormProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { categories: expenseCategories, incomeCategories } = useCategoryStore();

  const [kind, setKind] = useState<TransactionKind>(rule?.kind ?? initialKind);
  const initial = rule ?? initialValues;
  const [amount, setAmount] = useState(initial.amount ?? 0);
  const [categoryId, setCategoryId] = useState<number | null>(initial.category_id ?? null);
  const [description, setDescription] = useState(initial.description ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [interval, setIntervalText] = useState(String(rule?.interval ?? 1));
  const [startDate, setStartDate] = useState(initial.start_date ? new Date(initial.start_date) : new Date());
  const [endDate, setEndDate] = useState<Date | null>(rule?.end_date ? new Date(rule.end_date) : null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string; interval?: string; end?: string }>({});

  const categories = kind === 'income' ? incomeCategories : expenseCategories;
  const intervalNumber = /^\d+$/.test(interval.trim()) ? Number(interval.trim()) : 0;

  const schedule = useMemo(
    () => ({
      frequency,
      interval: Math.max(1, intervalNumber),
      start_date: toExpenseDay(startDate),
      end_date: endDate ? toExpenseDay(endDate) : null,
    }),
    [frequency, intervalNumber, startDate, endDate]
  );

  // What the schedule means right now, for the summary line.
  const preview = useMemo(() => {
    const todayDay = today();
    // The first date not generated yet, from today on.
    const upcoming = nextOccurrence(schedule, Math.max(todayDay - 1, rule?.last_occurrence ?? 0));
    return { upcoming, backfill: !rule && schedule.start_date < todayDay };
  }, [schedule, rule]);

  const validate = () => {
    const next: typeof errors = {};
    if (amount <= 0) next.amount = 'Please enter a valid amount';
    if (!categoryId) next.category = 'Please select a category';
    if (intervalNumber < 1 || intervalNumber > 999) next.interval = 'Enter a whole number from 1 to 999';
    if (endDate && toExpenseDay(endDate) < toExpenseDay(startDate)) next.end = 'The end date is before the start';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        kind,
        amount,
        category_id: categoryId!,
        location: kind === 'expense' ? location.trim() || null : null,
        description: description.trim() || null,
        ...schedule,
      });
      router.back();
    } catch (error) {
      console.error('Failed to save recurring rule:', error);
      setLoading(false);
    }
  };

  const handleDateChange = (_event: unknown, selected?: Date) => {
    const which = picking;
    setPicking(Platform.OS === 'ios' ? which : null);
    if (!selected) return;
    if (which === 'start') setStartDate(selected);
    if (which === 'end') {
      setEndDate(selected);
      setErrors((e) => ({ ...e, end: undefined }));
    }
  };

  const dateField = (label: string, value: Date, which: 'start' | 'end') => (
    <View style={styles.field}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
        {label}
      </Text>
      <Pressable
        onPress={() => {
          Keyboard.dismiss();
          setPicking(which);
        }}
        style={[styles.dateButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
          {formatDay(value)}
        </Text>
      </Pressable>
    </View>
  );

  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[frequency];

  return (
    <KeyboardAwareScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}>
      <View style={styles.form}>
        {!rule && (
          <SegmentedButtons
            value={kind}
            onValueChange={(value) => {
              setKind(value as TransactionKind);
              setCategoryId(null);
            }}
            buttons={[
              { value: 'expense', label: 'Expense', icon: 'cash-minus' },
              { value: 'income', label: 'Income', icon: 'cash-plus' },
            ]}
            style={styles.field}
          />
        )}

        <AmountInput
          value={amount}
          onChange={(value) => {
            setAmount(value);
            if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
          }}
          error={errors.amount}
        />

        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            if (errors.category) setErrors((e) => ({ ...e, category: undefined }));
          }}
          label={kind === 'income' ? 'Source' : 'Category'}
          error={errors.category}
        />

        <TextInput
          label={kind === 'income' ? 'Description (e.g. Salary)' : 'Description (e.g. Rent, Netflix)'}
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          style={styles.field}
        />

        {kind === 'expense' && (
          <TextInput
            label="Location (optional)"
            value={location}
            onChangeText={setLocation}
            mode="outlined"
            style={styles.field}
          />
        )}

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          Repeats
        </Text>
        <SegmentedButtons
          value={frequency}
          onValueChange={(value) => setFrequency(value as Frequency)}
          buttons={FREQUENCY_BUTTONS}
          density="small"
          style={styles.field}
        />

        <View style={styles.intervalRow}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
            Every
          </Text>
          <TextInput
            value={interval}
            onChangeText={(text) => {
              setIntervalText(text.replace(/[^0-9]/g, ''));
              if (errors.interval) setErrors((e) => ({ ...e, interval: undefined }));
            }}
            keyboardType="number-pad"
            mode="outlined"
            dense
            error={!!errors.interval}
            style={styles.intervalInput}
          />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
            {unit}
          </Text>
        </View>
        {errors.interval && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: -8, marginBottom: 12 }}>
            {errors.interval}
          </Text>
        )}

        {dateField(rule ? 'Start date' : 'First date', startDate, 'start')}

        <View style={styles.switchRow}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
            End date
          </Text>
          <Switch
            value={endDate !== null}
            onValueChange={(on) => {
              setEndDate(on ? new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate()) : null);
              setErrors((e) => ({ ...e, end: undefined }));
            }}
          />
        </View>
        {endDate && dateField('Last date (inclusive)', endDate, 'end')}
        {errors.end && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: -8, marginBottom: 12 }}>
            {errors.end}
          </Text>
        )}

        {picking && (
          <DateTimePicker
            value={picking === 'start' ? startDate : (endDate ?? startDate)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
        )}

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
          {describeFrequency(frequency, Math.max(1, intervalNumber))}
          {preview.upcoming ? ` · next on ${formatDay(new Date(preview.upcoming))}` : ' · no more dates'}
          {preview.backfill
            ? '. The first date is in the past: every date from it up to today is added when you save.'
            : '.'}
          {frequency === 'monthly' || frequency === 'yearly'
            ? ' Days past a month’s end fall on its last day.'
            : ''}
        </Text>

        <View style={styles.buttons}>
          <Button mode="outlined" onPress={() => router.back()} style={styles.button} disabled={loading}>
            Cancel
          </Button>
          <Button mode="contained" onPress={handleSave} style={styles.button} loading={loading} disabled={loading}>
            Save
          </Button>
        </View>

        {footer}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  field: {
    marginBottom: 16,
  },
  dateButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  intervalInput: {
    width: 72,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
});
