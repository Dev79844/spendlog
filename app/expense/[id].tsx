import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Pressable, Alert, Keyboard } from 'react-native';
import { Text, Button, TextInput, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AmountInput } from '@/components/amount-input';
import { CategoryPicker } from '@/components/category-picker';
import { useCategoryStore } from '@/lib/stores/category-store';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { getExpenseById } from '@/lib/db/expenses';
import { toExpenseDay } from '@/lib/date';

export default function EditExpenseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { categories } = useCategoryStore();
  const { updateExpense, deleteExpense } = useExpenseStore();

  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({});

  useEffect(() => {
    if (id) {
      const expense = getExpenseById(parseInt(id));
      if (expense) {
        // Prefill the form from the stored expense.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAmount(expense.amount);
        setDate(new Date(expense.date));
        setCategoryId(expense.category_id);
        setLocation(expense.location ?? '');
        setDescription(expense.description ?? '');
      }
    }
  }, [id]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (amount <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }
    if (!categoryId) {
      newErrors.category = 'Please select a category';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !id) return;

    setLoading(true);
    try {
      await updateExpense(parseInt(id), {
        amount,
        date: toExpenseDay(date),
        category_id: categoryId!,
        location: location.trim() || null,
        description: description.trim() || null,
      });
      router.back();
    } catch (error) {
      console.error('Failed to update expense:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setLoading(true);
            try {
              await deleteExpense(parseInt(id));
              router.back();
            } catch (error) {
              console.error('Failed to delete expense:', error);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleCategorySelect = (catId: number) => {
    Keyboard.dismiss();
    setCategoryId(catId);
    if (errors.category) setErrors((e) => ({ ...e, category: undefined }));
  };

  return (
    <KeyboardAwareScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}>
      <View style={styles.form}>
        <AmountInput
          value={amount}
          onChange={(val) => {
            setAmount(val);
            if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
          }}
          error={errors.amount}
        />

        <View style={styles.field}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Date
          </Text>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setShowDatePicker(true);
            }}
            style={[
              styles.dateButton,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.colors.outline,
              },
            ]}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
              {date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            maximumDate={new Date(new Date().setHours(23, 59, 59, 999))}
          />
        )}

        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          onSelect={handleCategorySelect}
          error={errors.category}
        />

        <TextInput
          label="Location (optional)"
          value={location}
          onChangeText={setLocation}
          mode="outlined"
          style={styles.textInput}
        />

        <TextInput
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.textInput}
        />

        <View style={styles.buttons}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.button}
            disabled={loading}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.button}
            loading={loading}
            disabled={loading}>
            Save
          </Button>
        </View>

        <Button
          mode="outlined"
          onPress={handleDelete}
          textColor={theme.colors.error}
          style={[styles.deleteButton, { borderColor: theme.colors.error }]}
          disabled={loading}>
          Delete Expense
        </Button>
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
  textInput: {
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
  },
  deleteButton: {
    marginTop: 24,
  },
});
