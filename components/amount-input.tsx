import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSettingsStore } from '@/lib/stores/settings-store';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  error?: string;
}

export function AmountInput({ value, onChange, label = 'Amount', error }: AmountInputProps) {
  const theme = useTheme();
  const currency = useSettingsStore((s) => s.currency);
  const [inputValue, setInputValue] = useState(value > 0 ? value.toString() : '');

  useEffect(() => {
    // Only update if the value changes externally and is different from current input
    const numericInput = parseFloat(inputValue) || 0;
    if (value !== numericInput && value > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue(value.toString());
    }
  }, [value]);

  const handleChange = (text: string) => {
    // Allow only numbers and one decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    
    // Limit to 2 decimal places
    const decimalParts = formatted.split('.');
    const finalValue =
      decimalParts.length === 2 && decimalParts[1].length > 2
        ? decimalParts[0] + '.' + decimalParts[1].slice(0, 2)
        : formatted;

    setInputValue(finalValue);
    onChange(parseFloat(finalValue) || 0);
  };

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
        {label}
      </Text>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: error ? theme.colors.error : theme.colors.outline,
          },
        ]}>
        <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>
          {currency.symbol}
        </Text>
        <TextInput
          style={[styles.input, { color: theme.colors.onSurface }]}
          value={inputValue}
          onChangeText={handleChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />
      </View>
      {error && (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    padding: 0,
  },
});
