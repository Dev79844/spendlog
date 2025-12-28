import { create } from 'zustand';
import * as categoryDb from '../db/categories';
import type { CategoryState, CreateCategoryInput, UpdateCategoryInput } from '../types';

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  loading: false,
  error: null,

  loadCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = categoryDb.getAllCategories();
      set({ categories, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addCategory: async (input: CreateCategoryInput) => {
    set({ loading: true, error: null });
    try {
      const newCategory = categoryDb.createCategory(input);
      set((state) => ({
        categories: [...state.categories, newCategory].sort((a, b) => a.name.localeCompare(b.name)),
        loading: false,
      }));
      return newCategory;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateCategory: async (id: number, input: UpdateCategoryInput) => {
    set({ loading: true, error: null });
    try {
      categoryDb.updateCategory(id, input);
      const updated = categoryDb.getCategoryById(id);
      if (updated) {
        set((state) => ({
          categories: state.categories
            .map((c) => (c.id === id ? updated : c))
            .sort((a, b) => a.name.localeCompare(b.name)),
          loading: false,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  deleteCategory: async (id: number) => {
    set({ loading: true, error: null });
    try {
      categoryDb.deleteCategory(id);
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  getCategoryById: (id: number) => {
    return get().categories.find((c) => c.id === id);
  },
}));
