import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { exportFileName, parseImportCsv } from '@/lib/csv';
import { db } from '@/lib/db';
import { applyCsvImport, buildCsvExport, isEmptyPlan, planCsvImport } from '@/lib/db/csv';

const MAX_ERRORS_SHOWN = 8;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface CsvDataSectionProps {
  /** Called after an import changed the database. */
  onImported: () => void;
}

/**
 * Settings card for CSV export (share sheet, or a folder on Android) and
 * import (document picker → preview → confirm). Everything is user-initiated;
 * nothing leaves the device unless the user sends the file somewhere.
 */
export function CsvDataSection({ onImported }: CsvDataSectionProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const run = async (kind: 'export' | 'import', task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      Alert.alert(
        kind === 'export' ? 'Export failed' : 'Import failed',
        `${(error as Error).message}\n\nNothing was changed.`
      );
    } finally {
      setBusy(null);
    }
  };

  const shareFile = (csv: string, name: string, summary: string) =>
    run('export', async () => {
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Save or send your Spendlog export',
      });
      Alert.alert('Export ready', `${name}\n${summary}`);
    });

  const saveToFolder = (csv: string, name: string, summary: string) =>
    run('export', async () => {
      // Rejects when the picker is dismissed.
      const directory = await Directory.pickDirectoryAsync().catch(() => null);
      if (!directory) return;
      const file = directory.createFile(name, 'text/csv');
      file.write(csv);
      Alert.alert('Export saved', `${name}\n${summary}`);
    });

  const handleExport = () => {
    let data: ReturnType<typeof buildCsvExport>;
    try {
      data = buildCsvExport(db);
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
      return;
    }
    const name = exportFileName(new Date());
    const summary = `${plural(data.expenseCount, 'expense')}, ${plural(data.incomeCount, 'income entry', 'income entries')}, ${plural(data.ruleCount, 'recurring rule')} and ${plural(data.categoryCount, 'category', 'categories')}.`;

    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: 'Cancel', style: 'cancel' }];
    if (Platform.OS === 'android') {
      buttons.push({ text: 'Save to folder', onPress: () => saveToFolder(data.csv, name, summary) });
    }
    buttons.push({ text: 'Share', onPress: () => shareFile(data.csv, name, summary) });

    Alert.alert('Export to CSV', `Export ${summary}`, buttons);
  };

  const handleImport = () =>
    run('import', async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        // Any file: Android labels CSVs inconsistently (text/csv, text/plain,
        // application/octet-stream, ...). parseImportCsv rejects anything else.
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];

      const text = await new File(asset.uri).text();
      const parsed = parseImportCsv(text);

      if (parsed.errors.length > 0) {
        const shown = parsed.errors
          .slice(0, MAX_ERRORS_SHOWN)
          .map((e) => (e.row > 0 ? `Row ${e.row}: ${e.message}` : e.message));
        if (parsed.errors.length > MAX_ERRORS_SHOWN) {
          shown.push(`…and ${parsed.errors.length - MAX_ERRORS_SHOWN} more.`);
        }
        Alert.alert(
          "Can't import this file",
          `${plural(parsed.errors.length, 'problem')} found in ${asset.name}. Nothing was imported.\n\n${shown.join('\n')}`
        );
        return;
      }

      const plan = planCsvImport(db, parsed);
      const lines = [`${plural(plan.expenses.length, 'expense')} to add`];
      if (plan.incomes.length > 0) {
        lines.push(`${plural(plan.incomes.length, 'income entry', 'income entries')} to add`);
      }
      if (plan.rules.length > 0) {
        lines.push(`${plural(plan.rules.length, 'recurring rule')} to add`);
      }
      const skipped = plan.duplicates + plan.incomeDuplicates + plan.ruleDuplicates;
      if (skipped > 0) {
        lines.push(`${plural(skipped, 'entry', 'entries')} already in Spendlog (skipped)`);
      }
      if (plan.newCategories.length > 0) {
        lines.push(
          `${plural(plan.newCategories.length, 'new category', 'new categories')}: ${plan.newCategories.map((c) => c.name).join(', ')}`
        );
      }
      if (plan.categoryUpdates.length > 0) {
        lines.push(
          `Color, icon or active state taken from the file for: ${plan.categoryUpdates.map((c) => c.name).join(', ')}`
        );
      }

      if (isEmptyPlan(plan)) {
        Alert.alert('Nothing to import', `${asset.name}\n\n${lines.join('\n')}`);
        return;
      }

      Alert.alert(
        'Import from CSV',
        `${asset.name}\n\n• ${lines.join('\n• ')}\n\nNo existing entries are changed or deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () =>
              run('import', async () => {
                applyCsvImport(db, plan);
                onImported();
                Alert.alert(
                  'Import complete',
                  `Added ${plural(plan.expenses.length, 'expense')}, ${plural(plan.incomes.length, 'income entry', 'income entries')} and ${plural(plan.rules.length, 'recurring rule')}.`
                );
              }),
          },
        ]
      );
    });

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Export all expenses, income, recurring rules and categories to a CSV file, or import one. Files stay on your
        device unless you send them somewhere.
      </Text>
      <View style={styles.buttons}>
        <Button
          mode="contained"
          icon="file-export-outline"
          onPress={handleExport}
          loading={busy === 'export'}
          disabled={busy !== null}>
          Export to CSV
        </Button>
        <Button
          mode="outlined"
          icon="file-import-outline"
          onPress={handleImport}
          loading={busy === 'import'}
          disabled={busy !== null}>
          Import from CSV
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    padding: 16,
  },
  buttons: {
    gap: 12,
  },
});
