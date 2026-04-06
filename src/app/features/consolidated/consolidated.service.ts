import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { TenantService } from '../../core/services/tenant.service';

export interface ConsolidatedRow {
  account_code: string;
  account_name: string;
  account_type: 'GELIR' | 'GIDER';
  parent_code: string | null;
  monthly: number[]; // index 0 = January, 11 = December
  annual_total: number;
}

export interface FirmBreakdown {
  firm_id: string;
  firm_name: string;
  total_gelir: number;
  total_gider: number;
  net: number;
}

export interface ConsolidatedKpis {
  totalGelir: number;
  totalGider: number;
  net: number;
  firmCount: number;
  topRevenueFirm: string;
  topExpenseFirm: string;
}

interface MonthlyIncomeExpenseRow {
  firm_id: string;
  year: number;
  month: number;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  total_amount: number;
}

@Injectable({ providedIn: 'root' })
export class ConsolidatedService {
  private supabase = inject(SupabaseService);
  private tenantService = inject(TenantService);

  private get client() {
    return this.supabase.client;
  }

  /** Fetch all firm IDs for a tenant */
  private async getFirmIds(tenantId: string): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.client
      .from('firms')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name');

    if (error) {
      console.error('Error fetching firms:', error);
      return [];
    }
    return (data ?? []) as { id: string; name: string }[];
  }

  /** Query monthly_income_expense for ALL firms in the tenant, aggregate per account_code */
  async getConsolidatedReport(tenantId: string, year: number): Promise<ConsolidatedRow[]> {
    const firms = await this.getFirmIds(tenantId);
    if (firms.length === 0) return [];

    const firmIds = firms.map(f => f.id);

    const { data, error } = await this.client
      .from('monthly_income_expense')
      .select('firm_id, year, month, account_code, account_name, account_type, parent_code, total_amount')
      .in('firm_id', firmIds)
      .eq('year', year);

    if (error) {
      console.error('Error fetching consolidated report:', error);
      return [];
    }

    const rows = (data ?? []) as MonthlyIncomeExpenseRow[];

    // Aggregate by account_code across all firms
    const accountMap = new Map<string, {
      account_code: string;
      account_name: string;
      account_type: 'GELIR' | 'GIDER';
      parent_code: string | null;
      monthly: number[];
    }>();

    for (const row of rows) {
      const key = row.account_code;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type as 'GELIR' | 'GIDER',
          parent_code: row.parent_code,
          monthly: new Array(12).fill(0),
        });
      }
      const entry = accountMap.get(key)!;
      const monthIdx = row.month - 1; // 0-based
      if (monthIdx >= 0 && monthIdx < 12) {
        entry.monthly[monthIdx] += row.total_amount ?? 0;
      }
    }

    return Array.from(accountMap.values()).map(entry => ({
      ...entry,
      annual_total: entry.monthly.reduce((sum, v) => sum + v, 0),
    })).sort((a, b) => a.account_code.localeCompare(b.account_code));
  }

  /** Per-firm totals for the comparison tab */
  async getFirmBreakdown(tenantId: string, year: number): Promise<FirmBreakdown[]> {
    const firms = await this.getFirmIds(tenantId);
    if (firms.length === 0) return [];

    const firmIds = firms.map(f => f.id);

    const { data, error } = await this.client
      .from('monthly_income_expense')
      .select('firm_id, account_type, total_amount')
      .in('firm_id', firmIds)
      .eq('year', year);

    if (error) {
      console.error('Error fetching firm breakdown:', error);
      return [];
    }

    const rows = (data ?? []) as { firm_id: string; account_type: string; total_amount: number }[];

    const firmMap = new Map<string, { gelir: number; gider: number }>();
    for (const firm of firms) {
      firmMap.set(firm.id, { gelir: 0, gider: 0 });
    }

    for (const row of rows) {
      const entry = firmMap.get(row.firm_id);
      if (!entry) continue;
      if (row.account_type === 'GELIR') {
        entry.gelir += row.total_amount ?? 0;
      } else if (row.account_type === 'GIDER') {
        entry.gider += row.total_amount ?? 0;
      }
    }

    return firms.map(firm => {
      const totals = firmMap.get(firm.id) ?? { gelir: 0, gider: 0 };
      return {
        firm_id: firm.id,
        firm_name: firm.name,
        total_gelir: totals.gelir,
        total_gider: totals.gider,
        net: totals.gelir - totals.gider,
      };
    });
  }

  /** Consolidated KPIs for the header cards */
  async getConsolidatedKpis(tenantId: string, year: number): Promise<ConsolidatedKpis> {
    const breakdown = await this.getFirmBreakdown(tenantId, year);

    const totalGelir = breakdown.reduce((sum, f) => sum + f.total_gelir, 0);
    const totalGider = breakdown.reduce((sum, f) => sum + f.total_gider, 0);
    const net = totalGelir - totalGider;
    const firmCount = breakdown.length;

    const topRevenueFirm =
      breakdown.length > 0
        ? breakdown.reduce((best, f) => (f.total_gelir > best.total_gelir ? f : best)).firm_name
        : '';

    const topExpenseFirm =
      breakdown.length > 0
        ? breakdown.reduce((best, f) => (f.total_gider > best.total_gider ? f : best)).firm_name
        : '';

    return { totalGelir, totalGider, net, firmCount, topRevenueFirm, topExpenseFirm };
  }
}
