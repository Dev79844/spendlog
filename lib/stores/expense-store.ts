import { create } from 'zustand';
import type { Expense, ExpenseState, CreateExpenseInput, UpdateExpenseInput } from '../types';
import * as expenseDb from '../db/expenses';
import { getCurrentMonth } from '../date';

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loading: false,
  error: null,
  currentMonth: getCurrentMonth(),
  monthlyTotal: 0,

  loadExpenses: async (month?: string) => {
    const targetMonth = month ?? get().currentMonth;
    set({ loading: true, error: null, currentMonth: targetMonth });
    try {
      const expenses = expenseDb.getExpensesByMonth(targetMonth);
      const monthlyTotal = expenseDb.getMonthlyTotal(targetMonth);
      set({ expenses, monthlyTotal, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addExpense: async (input: CreateExpenseInput) => {
    set({ loading: true, error: null });
    try {
      const newExpense = expenseDb.createExpense(input);
      // Reload expenses to get joined data and update totals
      const { currentMonth } = get();
      const expenses = expenseDb.getExpensesByMonth(currentMonth);
      const monthlyTotal = expenseDb.getMonthlyTotal(currentMonth);
      set({ expenses, monthlyTotal, loading: false });
      return newExpense;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateExpense: async (id: number, input: UpdateExpenseInput) => {
    set({ loading: true, error: null });
    try {
      expenseDb.updateExpense(id, input);
      // Reload expenses to get updated data
      const { currentMonth } = get();
      const expenses = expenseDb.getExpensesByMonth(currentMonth);
      const monthlyTotal = expenseDb.getMonthlyTotal(currentMonth);
      set({ expenses, monthlyTotal, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  deleteExpense: async (id: number) => {
    set({ loading: true, error: null });
    try {
      expenseDb.deleteExpense(id);
      // Reload expenses
      const { currentMonth } = get();
      const expenses = expenseDb.getExpensesByMonth(currentMonth);
      const monthlyTotal = expenseDb.getMonthlyTotal(currentMonth);
      set({ expenses, monthlyTotal, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  setCurrentMonth: (month: string) => {
    set({ currentMonth: month });
  },
}));
