// Database row types. All dates/times are epoch milliseconds (see lib/date.ts).
export interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  is_active: number; // SQLite uses 0/1 for booleans
  created_at: number;
}

export interface Expense {
  id: number;
  amount: number;
  date: number; // calendar day, stored as local noon (toExpenseDay)
  category_id: number;
  location: string | null;
  description: string | null;
  metadata: string | null; // JSON string
  created_at: number;
  updated_at: number;
}

// Expense with joined category data
export interface ExpenseWithCategory extends Expense {
  category_name: string;
  category_color: string | null;
}

// Input types for creating/updating
export interface CreateExpenseInput {
  amount: number;
  date: number;
  category_id: number;
  location?: string;
  description?: string;
  metadata?: string;
}

export interface UpdateExpenseInput {
  amount?: number;
  date?: number;
  category_id?: number;
  location?: string | null;
  description?: string | null;
  metadata?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
  is_active?: number;
}

// Store types
export interface CategoryState {
  categories: Category[];
  loading: boolean;
  error: string | null;
  loadCategories: () => Promise<void>;
  addCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (id: number, input: UpdateCategoryInput) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  getCategoryById: (id: number) => Category | undefined;
}

export interface ExpenseState {
  expenses: ExpenseWithCategory[];
  loading: boolean;
  error: string | null;
  currentMonth: string; // YYYY-MM format
  monthlyTotal: number;
  loadExpenses: (month?: string) => Promise<void>;
  addExpense: (input: CreateExpenseInput) => Promise<Expense>;
  updateExpense: (id: number, input: UpdateExpenseInput) => Promise<void>;
  deleteExpense: (id: number) => Promise<void>;
  setCurrentMonth: (month: string) => void;
}

// Summary types
export interface CategorySummary {
  category_id: number;
  category_name: string;
  category_color: string | null;
  total: number;
  percentage: number;
}

export interface MonthlySummary {
  total: number;
  categories: CategorySummary[];
  expenseCount: number;
}

// An expense day the shifted-dates migration fixed or wants the user to check
// (table date_review, see lib/db/migrations.ts and lib/db/date-review.ts).
export interface DateReviewItem extends ExpenseWithCategory {
  // 'add-shifted': fixed automatically; 'add-uncertain': saved near midnight
  // or near the UTC offset; 'edited': saved by the old edit screen.
  reason: 'add-shifted' | 'add-uncertain' | 'edited';
  status: 'pending' | 'fixed';
  original_date: number; // the day as the old app stored it
  suggested_date: number;
}

// Default categories
export const DEFAULT_CATEGORIES: CreateCategoryInput[] = [
  { name: 'Food & Dining', color: '#FF6B6B', icon: 'food' },
  { name: 'Transportation', color: '#4ECDC4', icon: 'car' },
  { name: 'Shopping', color: '#45B7D1', icon: 'cart' },
  { name: 'Bills & Utilities', color: '#96CEB4', icon: 'file-document' },
  { name: 'Entertainment', color: '#DDA0DD', icon: 'movie' },
  { name: 'Healthcare', color: '#98D8C8', icon: 'medical-bag' },
  { name: 'Education', color: '#F7DC6F', icon: 'school' },
  { name: 'Others', color: '#BDC3C7', icon: 'dots-horizontal' },
];
