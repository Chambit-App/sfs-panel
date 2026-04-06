import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { ChartOfAccounts } from '../../core/models/chart-of-accounts.model';

export interface BudgetVsActualRow {
  id: string;
  firm_id: string;
  year: number;
  month: number;
  chart_account_id: string;
  account_code: string;
  account_name: string;
  account_type: 'GELIR' | 'GIDER';
  planned_amount: number;
  actual_amount: number;
  variance: number;
  variance_pct: number;
}

export interface BudgetMonthlySummary {
  month: number;
  totalPlannedGelir: number;
  totalActualGelir: number;
  totalPlannedGider: number;
  totalActualGider: number;
  netPlanned: number;
  netActual: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private supabaseService = inject(SupabaseService);

  private get client() {
    return this.supabaseService.client;
  }

  async getBudgetVsActual(firmId: string, year: number): Promise<BudgetVsActualRow[]> {
    const { data, error } = await this.client
      .from('budget_vs_actual')
      .select('*')
      .eq('firm_id', firmId)
      .eq('year', year)
      .order('account_code', { ascending: true });

    if (error) {
      console.error('Error fetching budget vs actual:', error);
      return [];
    }

    return (data ?? []) as BudgetVsActualRow[];
  }

  async getChartOfAccounts(firmId: string, type?: 'GELIR' | 'GIDER'): Promise<ChartOfAccounts[]> {
    let query = this.client
      .from('chart_of_accounts')
      .select('*')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching chart of accounts:', error);
      return [];
    }

    return (data ?? []) as ChartOfAccounts[];
  }

  async saveBudgetPlans(
    firmId: string,
    plans: { year: number; month: number; chart_account_id: string; planned_amount: number }[]
  ): Promise<void> {
    if (plans.length === 0) return;

    const rows = plans.map(p => ({
      firm_id: firmId,
      year: p.year,
      month: p.month,
      chart_account_id: p.chart_account_id,
      planned_amount: p.planned_amount,
    }));

    const { error } = await this.client
      .from('budget_plans')
      .upsert(rows, { onConflict: 'firm_id,year,month,chart_account_id' });

    if (error) {
      console.error('Error saving budget plans:', error);
      throw error;
    }
  }

  async getBudgetSummary(firmId: string, year: number): Promise<BudgetMonthlySummary[]> {
    const rows = await this.getBudgetVsActual(firmId, year);

    const monthMap: Record<number, BudgetMonthlySummary> = {};
    for (let m = 1; m <= 12; m++) {
      monthMap[m] = {
        month: m,
        totalPlannedGelir: 0,
        totalActualGelir: 0,
        totalPlannedGider: 0,
        totalActualGider: 0,
        netPlanned: 0,
        netActual: 0,
      };
    }

    for (const row of rows) {
      const s = monthMap[row.month];
      if (!s) continue;
      if (row.account_type === 'GELIR') {
        s.totalPlannedGelir += row.planned_amount ?? 0;
        s.totalActualGelir += row.actual_amount ?? 0;
      } else if (row.account_type === 'GIDER') {
        s.totalPlannedGider += row.planned_amount ?? 0;
        s.totalActualGider += row.actual_amount ?? 0;
      }
    }

    for (let m = 1; m <= 12; m++) {
      const s = monthMap[m];
      s.netPlanned = s.totalPlannedGelir - s.totalPlannedGider;
      s.netActual = s.totalActualGelir - s.totalActualGider;
    }

    return Object.values(monthMap);
  }
}
