import { create } from 'zustand';
import { db } from '../db';
import * as recurringDb from '../db/recurring';
import type { RecurringRuleInput, RecurringState } from '../types';
import { useExpenseStore } from './expense-store';

export const useRecurringStore = create<RecurringState>((set, get) => {
  // After any change that may have generated rows: catch up, then refresh.
  const afterChange = () => {
    get().runDue();
    get().loadRules();
  };

  return {
    rules: [],
    error: null,
    generation: 0,

    loadRules: () => {
      try {
        set({ rules: recurringDb.getRecurringRules(db), error: null });
      } catch (error) {
        set({ error: (error as Error).message });
      }
    },

    runDue: () => {
      const inserted = recurringDb.materializeDueOccurrences(db);
      if (inserted > 0) {
        set((state) => ({ generation: state.generation + 1 }));
        // The expense store caches the current month; keep it in step.
        useExpenseStore.getState().loadExpenses();
      }
      return inserted;
    },

    addRule: async (input: RecurringRuleInput) => {
      const rule = recurringDb.createRecurringRule(db, input);
      afterChange();
      return rule;
    },

    updateRule: async (id: number, input: RecurringRuleInput) => {
      recurringDb.updateRecurringRule(db, id, input);
      afterChange();
    },

    setRuleActive: async (id: number, active: boolean) => {
      recurringDb.setRecurringRuleActive(db, id, active);
      afterChange();
    },

    deleteRule: async (id: number) => {
      recurringDb.deleteRecurringRule(db, id);
      get().loadRules();
    },
  };
});
