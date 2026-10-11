import { create } from 'zustand';
import * as incomeDb from '../db/incomes';
import type { CreateIncomeInput, IncomeState, UpdateIncomeInput } from '../types';

// Income writes. Screens read income directly from lib/db/incomes in
// useFocusEffect (like the Expenses list), so there is no cached list here.
export const useIncomeStore = create<IncomeState>((set) => ({
  loading: false,
  error: null,

  addIncome: async (input: CreateIncomeInput) => {
    set({ loading: true, error: null });
    try {
      const income = incomeDb.createIncome(input);
      set({ loading: false });
      return income;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateIncome: async (id: number, input: UpdateIncomeInput) => {
    set({ loading: true, error: null });
    try {
      incomeDb.updateIncome(id, input);
      set({ loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  deleteIncome: async (id: number) => {
    set({ loading: true, error: null });
    try {
      incomeDb.deleteIncome(id);
      set({ loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
}));
