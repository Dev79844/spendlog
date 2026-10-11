import React, { useState, useRef } from 'react';
import { View, StyleSheet, Platform, Pressable, Keyboard, TextInput as RNTextInput } from 'react-native';
import { Text, Button, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AmountInput } from '@/components/amount-input';
import { CategoryPicker } from '@/components/category-picker';
import { useCategoryStore } from '@/lib/stores/category-store';
import { useExpenseStore } from '@/lib/stores/expense-store';
import { toExpenseDay } from '@/lib/date';

export default function AddExpenseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { categories } = useCategoryStore();
  const { addExpense } = useExpenseStore();

  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({});

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
    if (!validate()) return;

    setLoading(true);
    try {
      await addExpense({
        amount,
        date: toExpenseDay(date),
        category_id: categoryId!,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.back();
    } catch (error) {
      console.error('Failed to add expense:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleCategorySelect = (id: number) => {
    Keyboard.dismiss();
    setCategoryId(id);
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
});
