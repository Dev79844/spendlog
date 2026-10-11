/**
 * Seed script for testing - generates realistic expense data across 2025
 * 
 * Usage: Import and call seedTestData() from a component or dev screen
 * Remember to remove before production!
 */

import { toExpenseDay } from '../date';
import { db } from './index';
import { getAllCategories } from './categories';

// Sample data for realistic expenses
const EXPENSE_TEMPLATES = {
  'Food & Dining': [
    { location: 'Swiggy', descriptions: ['Lunch order', 'Dinner', 'Biryani', 'Pizza'] },
    { location: 'Zomato', descriptions: ['Breakfast', 'South Indian', 'Chinese'] },
    { location: 'Starbucks', descriptions: ['Coffee', 'Latte', 'Frappuccino'] },
    { location: 'Local Restaurant', descriptions: ['Thali', 'Dosa', 'Meals'] },
    { location: 'Grocery Store', descriptions: ['Weekly groceries', 'Vegetables', 'Fruits'] },
    { location: 'BigBasket', descriptions: ['Monthly groceries', 'Snacks'] },
  ],
  'Transportation': [
    { location: 'Uber', descriptions: ['Office commute', 'Airport trip', 'Night ride'] },
    { location: 'Ola', descriptions: ['Auto ride', 'Cab to mall', 'Station pickup'] },
    { location: 'Metro', descriptions: ['Monthly pass', 'Token', 'Smart card recharge'] },
    { location: 'Petrol Pump', descriptions: ['Fuel', 'Petrol refill'] },
    { location: 'Rapido', descriptions: ['Bike taxi', 'Quick ride'] },
  ],
  'Shopping': [
    { location: 'Amazon', descriptions: ['Electronics', 'Books', 'Home items', 'Gadgets'] },
    { location: 'Flipkart', descriptions: ['Clothes', 'Shoes', 'Accessories'] },
    { location: 'Myntra', descriptions: ['T-shirts', 'Jeans', 'Formal wear'] },
    { location: 'DMart', descriptions: ['Household items', 'Cleaning supplies'] },
    { location: 'Reliance Digital', descriptions: ['Phone accessories', 'Charger'] },
  ],
  'Bills & Utilities': [
    { location: 'Electricity Board', descriptions: ['Monthly bill', 'Electricity'] },
    { location: 'Jio', descriptions: ['Mobile recharge', 'Fiber bill'] },
    { location: 'Airtel', descriptions: ['Postpaid bill', 'DTH recharge'] },
    { location: 'Water Board', descriptions: ['Water bill'] },
    { location: 'Gas', descriptions: ['Piped gas bill', 'Cylinder refill'] },
  ],
  'Entertainment': [
    { location: 'Netflix', descriptions: ['Monthly subscription'] },
    { location: 'Prime Video', descriptions: ['Annual subscription', 'Movie rental'] },
    { location: 'PVR Cinemas', descriptions: ['Movie tickets', 'Weekend movie'] },
    { location: 'Spotify', descriptions: ['Music subscription'] },
    { location: 'BookMyShow', descriptions: ['Concert tickets', 'Event booking'] },
  ],
  'Healthcare': [
    { location: 'Apollo Pharmacy', descriptions: ['Medicines', 'First aid'] },
    { location: 'Hospital', descriptions: ['Consultation', 'Health checkup'] },
    { location: 'Practo', descriptions: ['Online consultation'] },
    { location: 'Gym', descriptions: ['Monthly membership', 'Personal training'] },
    { location: 'PharmEasy', descriptions: ['Medicine order', 'Vitamins'] },
  ],
  'Education': [
    { location: 'Udemy', descriptions: ['Online course', 'Programming course'] },
    { location: 'Coursera', descriptions: ['Certification', 'Specialization'] },
    { location: 'Amazon', descriptions: ['Books', 'Study material'] },
    { location: 'Exam Center', descriptions: ['Exam fees', 'Registration'] },
  ],
  'Others': [
    { location: 'ATM', descriptions: ['Cash withdrawal fee'] },
    { location: 'Post Office', descriptions: ['Courier', 'Speed post'] },
    { location: 'Miscellaneous', descriptions: ['Random expense', 'Unplanned purchase'] },
    { location: 'Gift Shop', descriptions: ['Birthday gift', 'Anniversary gift'] },
  ],
};

// Amount ranges by category (in INR)
const AMOUNT_RANGES: Record<string, { min: number; max: number }> = {
  'Food & Dining': { min: 50, max: 2000 },
  'Transportation': { min: 20, max: 1500 },
  'Shopping': { min: 200, max: 10000 },
  'Bills & Utilities': { min: 200, max: 5000 },
  'Entertainment': { min: 100, max: 2000 },
  'Healthcare': { min: 100, max: 5000 },
  'Education': { min: 500, max: 15000 },
  'Others': { min: 50, max: 3000 },
};

// Helper functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(categoryName: string): number {
  const range = AMOUNT_RANGES[categoryName] || { min: 100, max: 1000 };
  // Round to nearest 10 for realism
  return Math.round(randomInt(range.min, range.max) / 10) * 10;
}

function generateExpenseForCategory(categoryId: number, categoryName: string, date: Date) {
  const templates = EXPENSE_TEMPLATES[categoryName as keyof typeof EXPENSE_TEMPLATES];
  if (!templates) return null;

  const template = randomElement(templates);
  const description = randomElement(template.descriptions);
  const amount = randomAmount(categoryName);

  return {
    amount,
    date: toExpenseDay(date),
    category_id: categoryId,
    location: template.location,
    description,
  };
}

export function seedTestData() {
  console.log('🌱 Starting seed...');

  // Get existing categories
  const categories = getAllCategories();
  if (categories.length === 0) {
    console.log('❌ No categories found. Run initDatabase first.');
    return;
  }

  const categoryMap = new Map(categories.map((c) => [c.name, c.id]));
  const now = Date.now();
  let totalExpenses = 0;

  // Generate expenses for each month of 2025 (Jan to current month or Dec)
  const currentDate = new Date();
  const endMonth = currentDate.getFullYear() === 2025 ? currentDate.getMonth() : 11;

  for (let month = 0; month <= endMonth; month++) {
    // Generate 15-40 expenses per month
    const expensesThisMonth = randomInt(15, 40);

    for (let i = 0; i < expensesThisMonth; i++) {
      // Random day in the month
      const daysInMonth = new Date(2025, month + 1, 0).getDate();
      const day = randomInt(1, Math.min(daysInMonth, currentDate.getFullYear() === 2025 && month === currentDate.getMonth() ? currentDate.getDate() : daysInMonth));
      const expenseDate = new Date(2025, month, day);

      // Pick a random category (weighted towards common ones)
      const weights = [
        { name: 'Food & Dining', weight: 30 },
        { name: 'Transportation', weight: 20 },
        { name: 'Shopping', weight: 15 },
        { name: 'Bills & Utilities', weight: 10 },
        { name: 'Entertainment', weight: 10 },
        { name: 'Healthcare', weight: 5 },
        { name: 'Education', weight: 5 },
        { name: 'Others', weight: 5 },
      ];

      const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedCategory = weights[0].name;

      for (const w of weights) {
        random -= w.weight;
        if (random <= 0) {
          selectedCategory = w.name;
          break;
        }
      }

      const categoryId = categoryMap.get(selectedCategory);
      if (!categoryId) continue;

      const expense = generateExpenseForCategory(categoryId, selectedCategory, expenseDate);
      if (!expense) continue;

      // Insert into database
      db.runSync(
        `INSERT INTO expenses (amount, date, category_id, location, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [expense.amount, expense.date, expense.category_id, expense.location, expense.description, now, now]
      );

      totalExpenses++;
    }

    console.log(`📅 Month ${month + 1}/2025: ${expensesThisMonth} expenses`);
  }

  console.log(`✅ Seed complete! Created ${totalExpenses} expenses.`);
}

export function clearAllExpenses() {
  db.runSync('DELETE FROM expenses');
  console.log('🗑️ All expenses deleted.');
}

// Quick function to add a dev button in settings
export function getExpenseCount(): number {
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM expenses');
  return result?.count ?? 0;
}
