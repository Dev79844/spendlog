import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Keyboard } from 'react-native';
import { Text, useTheme, Portal, Modal, Button } from 'react-native-paper';
import type { Category } from '@/lib/types';

interface CategoryPickerProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (categoryId: number) => void;
  label?: string;
  error?: string;
}

export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  label = 'Category',
  error,
}: CategoryPickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  const selectedCategory = categories.find((c) => c.id === selectedId);

  const handleOpen = () => {
    Keyboard.dismiss();
    setVisible(true);
  };

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
        {label}
      </Text>
      <Pressable
        onPress={handleOpen}
        style={[
          styles.selector,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: error ? theme.colors.error : theme.colors.outline,
          },
        ]}>
        {selectedCategory ? (
          <View style={styles.selectedContent}>
            <View
              style={[
                styles.colorDot,
                { backgroundColor: selectedCategory.color ?? theme.colors.primary },
              ]}
            />
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
              {selectedCategory.name}
            </Text>
          </View>
        ) : (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Select a category
          </Text>
        )}
      </Pressable>
      {error && (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
          {error}
        </Text>
      )}

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ marginBottom: 16, color: theme.colors.onSurface }}>
            Select Category
          </Text>
          <ScrollView style={styles.scrollView}>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => {
                  onSelect(category.id);
                  setVisible(false);
                }}
                style={({ pressed }) => [
                  styles.categoryItem,
                  {
                    backgroundColor:
                      category.id === selectedId
                        ? theme.colors.primaryContainer
                        : pressed
                        ? theme.colors.surfaceVariant
                        : 'transparent',
                  },
                ]}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: category.color ?? theme.colors.primary },
                  ]}
                />
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button onPress={() => setVisible(false)} style={{ marginTop: 16 }}>
            Cancel
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  selector: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: '70%',
  },
  scrollView: {
    maxHeight: 400,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 8,
  },
});
