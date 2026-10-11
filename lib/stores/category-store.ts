import { create } from 'zustand';
import * as categoryDb from '../db/categories';
import type {
  Category,
  CategoryState,
  CreateCategoryInput,
  TransactionKind,
  UpdateCategoryInput,
} from '../types';

// Expense categories are in `categories`, income categories in `incomeCategories`.
const listKey = (kind: TransactionKind) => (kind === 'income' ? 'incomeCategories' : 'categories');
const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  incomeCategories: [],
  loading: false,
  error: null,

  loadCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = categoryDb.getAllCategories('expense');
      const incomeCategories = categoryDb.getAllCategories('income');
      set({ categories, incomeCategories, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addCategory: async (input: CreateCategoryInput, kind: TransactionKind = 'expense') => {
    set({ loading: true, error: null });
    try {
      const newCategory = categoryDb.createCategory(input, kind);
      const key = listKey(kind);
      set((state) => ({
        [key]: [...state[key], newCategory].sort(byName),
        loading: false,
      }));
      return newCategory;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateCategory: async (id: number, input: UpdateCategoryInput, kind: TransactionKind = 'expense') => {
    set({ loading: true, error: null });
    try {
      categoryDb.updateCategory(id, input, kind);
      const updated = categoryDb.getCategoryById(id, kind);
      if (updated) {
        const key = listKey(kind);
        set((state) => ({
          [key]: state[key].map((c) => (c.id === id ? updated : c)).sort(byName),
          loading: false,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  deleteCategory: async (id: number, kind: TransactionKind = 'expense') => {
    set({ loading: true, error: null });
    try {
      categoryDb.deleteCategory(id, kind);
      const key = listKey(kind);
      set((state) => ({
        [key]: state[key].filter((c) => c.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  getCategoryById: (id: number, kind: TransactionKind = 'expense') => {
    return get()[listKey(kind)].find((c) => c.id === id);
  },
}));
