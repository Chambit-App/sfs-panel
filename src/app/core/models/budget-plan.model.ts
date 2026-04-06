export interface BudgetPlan {
  id: string;
  firm_id: string;
  year: number;
  month: number;           // 1-12
  chart_account_id: string;
  planned_amount: number;
  actual_amount: number;   // computed from transactions
  created_at: string;
  updated_at: string;
  // computed
  variance?: number;        // actual - planned
  variance_pct?: number;    // (actual - planned) / planned
  // joined
  account_code?: string;
  account_name?: string;
}
