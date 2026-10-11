import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { RecurringRuleForm } from '@/components/recurring-rule-form';
import { useRecurringStore } from '@/lib/stores/recurring-store';

// Params (all optional) prefill the form, e.g. from "Make this repeat…" on
// the add-expense form: kind, amount, categoryId, description, location,
// start (epoch ms).
export default function AddRecurringScreen() {
  const params = useLocalSearchParams<{
    kind?: string;
    amount?: string;
    categoryId?: string;
    description?: string;
    location?: string;
    start?: string;
  }>();
  const addRule = useRecurringStore((s) => s.addRule);
  const number = (value?: string) => (value && Number(value) > 0 ? Number(value) : undefined);

  return (
    <RecurringRuleForm
      initialKind={params.kind === 'income' ? 'income' : 'expense'}
      initialValues={{
        amount: number(params.amount),
        category_id: number(params.categoryId),
        description: params.description || undefined,
        location: params.location || undefined,
        start_date: number(params.start),
      }}
      onSubmit={async (input) => {
        await addRule(input);
      }}
    />
  );
}
