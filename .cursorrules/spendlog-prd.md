# Product Requirements Document: Personal Expense Tracker

## Overview
A minimalist, offline-first expense tracking and budgeting mobile app built with React Native (Expo), using SQLite for local data persistence. No backend server required.

## Target Audience
Personal use - single user tracking their own expenses with a focus on simplicity and speed.

## Technical Stack
- **Framework**: React Native with Expo
- **Database**: SQLite (expo-sqlite)
- **Storage**: All data stored locally on device
- **Platform**: Android (primary), iOS compatible

## Core Features

### 1. Expense Management

#### 1.1 Add Expense
**Required Fields:**
- Amount (numeric, required)
- Date (date picker, defaults to today)
- Category (dropdown/select from custom categories)

**Optional Fields:**
- Location/Where (text input)
- Description/Why (text input)
- Metadata (flexible key-value pairs or JSON field for future extensibility)

**Behavior:**
- Quick add flow - minimal taps to record expense
- Date picker should allow past/future dates
- Amount should support decimal values
- Auto-save on completion

#### 1.2 Edit/Delete Expense
- Ability to modify any expense record
- Soft delete with confirmation dialog
- View full expense details

#### 1.3 Expense List View
- Chronological list (newest first by default)
- Display: date, category, amount, brief description
- Tap to view/edit full details
- Group by date with section headers
- Infinite scroll or pagination for performance

### 2. Category Management

#### 2.1 Custom Categories
- Create unlimited custom categories
- Each category has:
  - Name (required, unique)
  - Color/Icon (optional, for visual distinction)
  - Active/Inactive status

#### 2.2 Default Categories
Provide sensible defaults:
- Food & Dining
- Transportation
- Shopping
- Bills & Utilities
- Entertainment
- Healthcare
- Education
- Others

#### 2.3 Category Operations
- Add new category
- Edit category name/color
- Delete category (with warning if expenses exist)
- Reassign expenses when deleting category

### 3. Income Management

#### 3.1 Monthly Income Entry
- Set monthly income amount
- Edit anytime
- Optional: multiple income sources
- Store income history by month

#### 3.2 Income Display
- Show current month's income
- Display in summary/analytics views

### 4. Summary Views

#### 4.1 Monthly Summary
- Current month overview (default view)
- Total expenses for the month
- Remaining budget (income - expenses)
- Breakdown by category (amount and percentage)
- Day-by-day spending trend
- Comparison with previous month
- Month selector to view past months

#### 4.2 Yearly Summary
- Total expenses for current/selected year
- Month-by-month breakdown
- Category-wise annual totals
- Average monthly spending
- Highest/lowest spending months
- Year selector for historical data

### 5. Analytics & Insights

#### 5.1 Key Metrics
- **Spending Rate**: Daily average spending
- **Budget Health**: Percentage of income spent
- **Category Leaders**: Top 3 spending categories
- **Trend Indicator**: Spending up/down vs previous period
- **Streak Tracker**: Days since last expense (optional motivator)

#### 5.2 Visual Analytics
- Category distribution pie/donut chart
- Monthly spending line/bar chart
- Income vs Expense comparison chart
- Spending trends over time

#### 5.3 Smart Insights
- Alert when nearing budget limit (e.g., 80% spent)
- Identify unusual spending patterns
- Show average spending per category
- Projection: "At this rate, you'll spend X this month"

### 6. Search & Filter

#### 6.1 Search
- Search by description/location text
- Search results displayed as expense list
- Clear search button
- Search should be fast (indexed fields)

#### 6.2 Filter Options
- Date range (from-to, last 7 days, last 30 days, custom)
- Category (single or multiple)
- Amount range (min-max)
- Apply multiple filters simultaneously
- Save common filter presets (optional)
- Reset filters button

#### 6.3 Sort Options
- Date (newest/oldest)
- Amount (highest/lowest)
- Category (alphabetical)

### 7. Data Export

#### 7.1 CSV Export
- Export all expenses or filtered subset
- Include all fields: date, amount, category, location, description, metadata
- File naming: `expenses_YYYY-MM-DD.csv`
- Share via native share sheet (email, drive, etc.)

#### 7.2 Export Options
- Export by date range
- Export by category
- Export all data
- Include income data in separate sheet/section

### 8. Additional Features

#### 8.1 Backup & Restore
- Manual backup: export entire SQLite database
- Import from backup file
- Backup reminder (weekly/monthly notification)

#### 8.2 Settings
- Currency symbol selection
- Date format preference (DD/MM/YYYY vs MM/DD/YYYY)
- First day of week (for weekly views)
- App theme (light/dark mode)
- Default category for quick add

#### 8.3 Recurring Expenses (Nice-to-have)
- Mark expenses as recurring
- Auto-generate monthly (rent, subscriptions)
- Edit/delete future occurrences

#### 8.4 Notifications (Optional)
- Daily reminder to log expenses (if enabled)
- Budget warning alerts
- End-of-month summary notification

## Database Schema

### Tables

#### `expenses`
```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  location TEXT,
  description TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

#### `categories`
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `income`
```sql
CREATE TABLE income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month, year)
);
```

#### `settings`
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## User Interface

### Navigation Structure
- **Bottom Tab Navigation:**
  - Home (Monthly Summary)
  - Expenses (List view)
  - Analytics
  - Settings

- **Floating Action Button (FAB):**
  - Quick Add Expense (accessible from all screens)

### Screen Breakdown

#### Home Screen
- Current month summary card
- Quick stats (total spent, remaining budget, top category)
- Recent expenses (last 5-10)
- FAB for quick add

#### Expenses Screen
- List of all expenses
- Search bar at top
- Filter button (opens filter modal)
- Pull to refresh
- FAB for quick add

#### Analytics Screen
- Time period selector (Month/Year)
- Charts and visualizations
- Key insights cards
- Export button

#### Add/Edit Expense Screen
- Form with all expense fields
- Save and Cancel buttons
- Delete button (edit mode only)

#### Categories Screen (in Settings)
- List of categories with color indicators
- Add category button
- Tap to edit/delete

#### Settings Screen
- Income management
- Categories management
- Export data
- Backup/Restore
- App preferences
- About section

## Non-Functional Requirements

### Performance
- App launch time < 2 seconds
- Expense list should handle 10,000+ records smoothly
- Search results instant (< 500ms)
- Chart rendering < 1 second

### Data Integrity
- All database operations should be transactional
- Automatic backups before major operations
- Validate all user inputs
- Handle SQLite errors gracefully

### UX Principles
- Minimize taps to add expense (3-4 taps maximum)
- Clear visual hierarchy
- Intuitive icons and labels
- Responsive to user actions (loading states, confirmations)
- Offline-first (no network dependency)

### Accessibility
- Proper text contrast ratios
- Touch targets minimum 44x44 dp
- Screen reader support
- Text scaling support

## Success Metrics
- Time to add expense < 30 seconds
- Zero data loss
- App crash rate < 0.1%
- User retention (personal use, but measured by continued daily use)

## Future Enhancements (Out of Scope for v1)
- Multiple currency support
- Shared expenses/splitting bills
- Receipt photo attachment
- Budget goals per category
- Savings tracking
- Investment tracking
- Cloud sync (optional, privacy-focused)
- Widget for home screen

## Development Phases

### Phase 1: MVP
- Basic expense CRUD
- Categories management
- Monthly summary
- SQLite integration

### Phase 2: Core Features
- Income management
- Search & filter
- Analytics dashboard
- CSV export

### Phase 3: Polish
- Charts and visualizations
- Insights and alerts
- Settings and customization
- UI/UX refinement

### Phase 4: Enhancement
- Backup/restore
- Recurring expenses
- Notifications
- Performance optimization

## Technical Considerations

### Expo Packages Required
- `expo-sqlite`: Database
- `expo-file-system`: File operations for export/backup
- `expo-sharing`: Share CSV files
- `expo-notifications`: Local notifications
- `react-navigation`: Navigation
- `react-native-chart-kit` or `victory-native`: Charts
- `react-native-paper` or `react-native-elements`: UI components

### State Management
- Zustand for state management
- SQLite as single source of truth

### Data Migration
- Version control for database schema
- Migration scripts for schema updates
- Preserve user data across app updates

## Constraints & Assumptions
- Single user per device (no multi-user support)
- Device storage sufficient for years of expense data
- User understands basic expense tracking concepts
- Android 8.0+ (API level 26+) minimum
- No requirement for real-time sync or collaboration

## Open Questions for Development
1. Should we support multiple currencies within the same database?
2. How many years of historical data should the app optimize for?
3. Should category colors be predefined palette or custom color picker?
4. Maximum metadata size limit?
5. Should deleted expenses be permanently removed or soft-deleted with archive?