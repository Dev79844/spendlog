import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Button, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCategoryStore } from '@/lib/stores/category-store';

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

export default function AddCategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addCategory } = useCategoryStore();

  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a category name');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await addCategory({
        name: name.trim(),
        color,
      });
      router.back();
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        setError('A category with this name already exists');
      } else {
        setError('Failed to create category');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled">
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
});
