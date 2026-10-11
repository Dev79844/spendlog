import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Text, Button, TextInput, useTheme } from 'react-native-paper';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCategoryStore } from '@/lib/stores/category-store';
import { db } from '@/lib/db';
import { getCategoryExpenseCount } from '@/lib/db/categories';
import { getCategoryRuleCount } from '@/lib/db/recurring';

const PRESET_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BDC3C7', // Gray
  '#E74C3C', // Dark Red
  '#9B59B6', // Purple
  '#3498DB', // Sky Blue
  '#1ABC9C', // Turquoise
];

export default function EditCategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `?kind=income` edits an income category.
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const kind = kindParam === 'income' ? 'income' : 'expense';
  const { categories: expenseCategories, incomeCategories, updateCategory, deleteCategory } = useCategoryStore();
  const categories = kind === 'income' ? incomeCategories : expenseCategories;

  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const category = categories.find((c) => c.id === parseInt(id));
      if (category) {
        // Prefill the form once the category is available.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(category.name);
        setColor(category.color ?? PRESET_COLORS[0]);
      }
    }
  }, [id, categories]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a category name');
      return;
    }

    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      await updateCategory(
        parseInt(id),
        {
          name: name.trim(),
          color,
        },
        kind
      );
      router.back();
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        setError('A category with this name already exists');
      } else {
        setError('Failed to update category');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!id) return;

    const expenseCount = getCategoryExpenseCount(parseInt(id), kind);
    const ruleCount = getCategoryRuleCount(db, parseInt(id), kind);

    if (expenseCount > 0 || ruleCount > 0) {
      const used = [
        expenseCount > 0 ? `${expenseCount} ${kind === 'income' ? 'income' : 'expense'} entr${expenseCount > 1 ? 'ies' : 'y'}` : '',
        ruleCount > 0 ? `${ruleCount} recurring rule${ruleCount > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      Alert.alert(
        'Cannot Delete',
        `This category is used by ${used.join(' and ')}. Delete or reassign those first.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this category?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteCategory(parseInt(id), kind);
              router.back();
            } catch (error) {
              console.error('Failed to delete category:', error);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: kind === 'income' ? 'Edit Income Category' : 'Edit Category' }} />
      <View style={styles.form}>
        <TextInput
          label="Category Name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          mode="outlined"
          error={!!error}
          style={styles.textInput}
        />
        {error && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: -12, marginBottom: 16 }}>
            {error}
          </Text>
        )}

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          Color
        </Text>
        <View style={styles.colorGrid}>
          {PRESET_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.colorOption,
                { backgroundColor: c },
                color === c && styles.colorSelected,
              ]}>
              {color === c && (
                <View style={styles.checkmark}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.preview}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            Preview
          </Text>
          <View style={[styles.previewCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.previewDot, { backgroundColor: color }]} />
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
              {name || 'Category Name'}
            </Text>
          </View>
        </View>

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
          Delete Category
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  textInput: {
    marginBottom: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: {
    marginBottom: 24,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  previewDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
  deleteButton: {
    marginTop: 24,
  },
});
