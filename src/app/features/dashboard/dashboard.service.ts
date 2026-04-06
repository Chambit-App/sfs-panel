import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { Transaction } from '../../core/models/transaction.model';

export interface KpiSummary {
  totalGelir: number;
  totalGider: number;
  netKarZarar: number;
  totalBankBalance: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface MonthlyTrendItem {
  month: number;
  gelir: number;
  gider: number;
}

export interface BankBalance {
  bank_name: string;
  balance: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private supabaseService = inject(SupabaseService);

  private get client() {
    return this.supabaseService.client;
  }

  async getKpiSummary(firmId: string): Promise<KpiSummary> {
    const today = new Date().toISOString().split('T')[0];

    const [gelirResult, giderResult, bankResult, overdueResult] = await Promise.all([
      this.client
        .from('transactions')
        .select('amount')
        .eq('firm_id', firmId)
        .eq('type', 'GELIR')
        .eq('status', 'ODENDI'),

      this.client
        .from('transactions')
        .select('amount')
        .eq('firm_id', firmId)
        .eq('type', 'GIDER')
        .eq('status', 'ODENDI'),

      this.client
        .from('bank_account_balances')
        .select('balance')
        .eq('firm_id', firmId),

      this.client
        .from('transactions')
        .select('amount')
        .eq('firm_id', firmId)
        .eq('status', 'BEKLIYOR')
        .lt('due_date', today),
    ]);

    const totalGelir = (gelirResult.data ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
    const totalGider = (giderResult.data ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
    const totalBankBalance = (bankResult.data ?? []).reduce((sum, r) => sum + (r.balance ?? 0), 0);
    const overdueRows = overdueResult.data ?? [];
    const overdueCount = overdueRows.length;
    const overdueAmount = overdueRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

    return {
      totalGelir,
      totalGider,
      netKarZarar: totalGelir - totalGider,
      totalBankBalance,
      overdueCount,
      overdueAmount,
    };
  }

  async getMonthlyTrend(firmId: string, year: number): Promise<MonthlyTrendItem[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data, error } = await this.client
      .from('transactions')
      .select('type, amount, invoice_date')
      .eq('firm_id', firmId)
      .eq('status', 'ODENDI')
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (error) {
      console.error('Error fetching monthly trend:', error);
      return [];
    }

    const monthMap: Record<number, { gelir: number; gider: number }> = {};
    for (let m = 1; m <= 12; m++) {
      monthMap[m] = { gelir: 0, gider: 0 };
    }

    for (const row of data ?? []) {
      const month = new Date(row.invoice_date).getMonth() + 1;
      if (row.type === 'GELIR') {
        monthMap[month].gelir += row.amount ?? 0;
      } else if (row.type === 'GIDER') {
        monthMap[month].gider += row.amount ?? 0;
      }
    }

    return Object.entries(monthMap).map(([month, vals]) => ({
      month: Number(month),
      gelir: vals.gelir,
      gider: vals.gider,
    }));
  }

  async getUpcomingPayments(firmId: string, days: number): Promise<Transaction[]> {
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + days);

    const todayStr = today.toISOString().split('T')[0];
    const futureStr = future.toISOString().split('T')[0];

    const { data, error } = await this.client
      .from('transactions')
      .select('*')
      .eq('firm_id', firmId)
      .eq('status', 'BEKLIYOR')
      .gte('due_date', todayStr)
      .lte('due_date', futureStr)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming payments:', error);
      return [];
    }

    return (data ?? []) as Transaction[];
  }

  async getOverduePayments(firmId: string): Promise<Transaction[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.client
      .from('transactions')
      .select('*')
      .eq('firm_id', firmId)
      .eq('status', 'BEKLIYOR')
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching overdue payments:', error);
      return [];
    }

    return (data ?? []) as Transaction[];
  }

  async getBankBalances(firmId: string): Promise<BankBalance[]> {
    const { data, error } = await this.client
      .from('bank_account_balances')
      .select('bank_name, balance')
      .eq('firm_id', firmId);

    if (error) {
      console.error('Error fetching bank balances:', error);
      return [];
    }

    return (data ?? []) as BankBalance[];
  }
}
