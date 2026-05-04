import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

// ── Raw DB row from monthly_income_expense view ──────────────────────────────
export interface MonthlyIncomeExpenseRow {
  firm_id: string;
  year: number;
  month: number;
  account_code: string;
  account_name: string;
  account_type: 'GELIR' | 'GIDER';
  parent_code: string | null;
  total_amount: number;
  transaction_count: number;
}

// ── Pivoted report row (one row per account, 12 month columns) ────────────────
export interface MonthlyReportRow {
  code: string;
  name: string;
  type: 'GELIR' | 'GIDER';
  parentCode: string | null;
  isGroupHeader: boolean;
  months: number[]; // index 0-11 for Jan-Dec
  total: number;    // sum of months
}

// ── Year-over-Year row ────────────────────────────────────────────────────────
export interface YoYReportRow {
  code: string;
  name: string;
  type: 'GELIR' | 'GIDER';
  parentCode: string | null;
  isGroupHeader: boolean;
  year1Months: number[];
  year2Months: number[];
  year1Total: number;
  year2Total: number;
  diff: number;
  diffPct: number | null;
}

// ── P&L summary per month ─────────────────────────────────────────────────────
export interface PnLMonthSummary {
  month: number;
  totalGelir: number;
  totalGider: number;
  net: number;
}

// ── Budget vs Actual row (from budget_vs_actual view) ────────────────────────
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

// ── Cari aging row ───────────────────────────────────────────────────────────
export interface CariAgingRow {
  cari_id: string;
  cari_name: string;
  cari_type: 'MUSTERI' | 'TEDARIKCI';
  current: number;     // not yet due
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

// ── Expense breakdown slice ──────────────────────────────────────────────────
export interface ExpenseSliceRow {
  code: string;
  name: string;
  amount: number;
  percent: number;
}

// ── Overdue transaction row ──────────────────────────────────────────────────
export interface OverdueRow {
  id: string;
  type: 'GELIR' | 'GIDER';
  amount: number;
  due_date: string;
  days_late: number;
  invoice_no: string;
  description: string;
  cari_name: string;
  cari_type: 'MUSTERI' | 'TEDARIKCI';
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private supabaseService = inject(SupabaseService);

  private get client() {
    return this.supabaseService.client;
  }

  // ── Fetch raw rows from the view ──────────────────────────────────────────
  private async fetchMonthlyRows(
    firmId: string,
    year: number
  ): Promise<MonthlyIncomeExpenseRow[]> {
    const { data, error } = await this.client
      .from('monthly_income_expense')
      .select('*')
      .eq('firm_id', firmId)
      .eq('year', year)
      .order('account_code', { ascending: true });

    if (error) {
      console.error('Error fetching monthly_income_expense:', error);
      return [];
    }

    return (data ?? []) as MonthlyIncomeExpenseRow[];
  }

  // ── Build pivoted MonthlyReportRow[] from raw rows ────────────────────────
  private pivotRows(rawRows: MonthlyIncomeExpenseRow[]): MonthlyReportRow[] {
    // Map: accountCode -> MonthlyReportRow
    const map = new Map<string, MonthlyReportRow>();

    for (const row of rawRows) {
      let entry = map.get(row.account_code);
      if (!entry) {
        entry = {
          code: row.account_code,
          name: row.account_name,
          type: row.account_type,
          parentCode: row.parent_code,
          isGroupHeader: false,
          months: Array(12).fill(0),
          total: 0,
        };
        map.set(row.account_code, entry);
      }
      const monthIdx = row.month - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        entry.months[monthIdx] += row.total_amount ?? 0;
      }
    }

    // Compute totals
    for (const entry of map.values()) {
      entry.total = entry.months.reduce((s, v) => s + v, 0);
    }

    // Build group headers for parent codes that are not already in the map
    const parentCodes = new Set<string>();
    for (const row of rawRows) {
      if (row.parent_code) {
        parentCodes.add(`${row.account_type}::${row.parent_code}`);
      }
    }

    const groupHeaders: MonthlyReportRow[] = [];
    for (const key of parentCodes) {
      const [type, parentCode] = key.split('::') as ['GELIR' | 'GIDER', string];
      if (!map.has(parentCode)) {
        groupHeaders.push({
          code: parentCode,
          name: parentCode,
          type,
          parentCode: null,
          isGroupHeader: true,
          months: Array(12).fill(0),
          total: 0,
        });
      } else {
        // Mark existing entry as group header
        const existing = map.get(parentCode)!;
        existing.isGroupHeader = true;
      }
    }

    // Sum child amounts into group headers
    const allRows = [...map.values(), ...groupHeaders];
    for (const row of allRows) {
      if (!row.isGroupHeader) continue;
      // find children
      for (const child of allRows) {
        if (child.parentCode === row.code && child.code !== row.code) {
          for (let i = 0; i < 12; i++) {
            row.months[i] += child.months[i];
          }
        }
      }
      row.total = row.months.reduce((s, v) => s + v, 0);
    }

    return allRows.sort((a, b) => a.code.localeCompare(b.code));
  }

  // ── Public: Monthly report ────────────────────────────────────────────────
  async getMonthlyReport(firmId: string, year: number): Promise<MonthlyReportRow[]> {
    const raw = await this.fetchMonthlyRows(firmId, year);
    return this.pivotRows(raw);
  }

  // ── Public: Year-over-Year report ─────────────────────────────────────────
  async getYearOverYearReport(
    firmId: string,
    year1: number,
    year2: number
  ): Promise<YoYReportRow[]> {
    const [rows1, rows2] = await Promise.all([
      this.getMonthlyReport(firmId, year1),
      this.getMonthlyReport(firmId, year2),
    ]);

    // Merge by code
    const codeMap = new Map<string, YoYReportRow>();

    const toYoY = (r: MonthlyReportRow): YoYReportRow => ({
      code: r.code,
      name: r.name,
      type: r.type,
      parentCode: r.parentCode,
      isGroupHeader: r.isGroupHeader,
      year1Months: [...r.months],
      year2Months: Array(12).fill(0),
      year1Total: r.total,
      year2Total: 0,
      diff: 0,
      diffPct: null,
    });

    for (const r of rows1) {
      codeMap.set(r.code, toYoY(r));
    }

    for (const r of rows2) {
      if (codeMap.has(r.code)) {
        const entry = codeMap.get(r.code)!;
        entry.year2Months = [...r.months];
        entry.year2Total = r.total;
      } else {
        codeMap.set(r.code, {
          code: r.code,
          name: r.name,
          type: r.type,
          parentCode: r.parentCode,
          isGroupHeader: r.isGroupHeader,
          year1Months: Array(12).fill(0),
          year2Months: [...r.months],
          year1Total: 0,
          year2Total: r.total,
          diff: 0,
          diffPct: null,
        });
      }
    }

    // Compute diff & %
    for (const entry of codeMap.values()) {
      entry.diff = entry.year2Total - entry.year1Total;
      entry.diffPct =
        entry.year1Total !== 0
          ? ((entry.diff / Math.abs(entry.year1Total)) * 100)
          : null;
    }

    return [...codeMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  // ── Public: Budget vs Actual ───────────────────────────────────────────────
  async getBudgetVsActual(firmId: string, year: number): Promise<BudgetVsActualRow[]> {
    const { data, error } = await this.client
      .from('budget_vs_actual')
      .select('*')
      .eq('firm_id', firmId)
      .eq('year', year)
      .order('account_code', { ascending: true });

    if (error) {
      console.error('Error fetching budget_vs_actual:', error);
      return [];
    }

    return (data ?? []) as BudgetVsActualRow[];
  }

  // ── Public: Cari Aging ─────────────────────────────────────────────────────
  async getCariAging(firmId: string): Promise<CariAgingRow[]> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.client
      .from('transactions')
      .select('cari_id, due_date, type, amount, cari_accounts!inner(name, type, firm_id)')
      .eq('firm_id', firmId)
      .eq('status', 'BEKLIYOR');

    if (error) {
      console.error('Error fetching aging:', error);
      return [];
    }

    const map = new Map<string, CariAgingRow>();
    const now = new Date(today);

    for (const row of (data as unknown as Array<Record<string, unknown>> ?? [])) {
      const cariRaw = row['cari_accounts'];
      const cari = (Array.isArray(cariRaw) ? cariRaw[0] : cariRaw) as
        | { name: string; type: 'MUSTERI' | 'TEDARIKCI' }
        | null;
      if (!cari) continue;

      const cariId = row['cari_id'] as string;
      let entry = map.get(cariId);
      if (!entry) {
        entry = {
          cari_id: cariId,
          cari_name: cari.name,
          cari_type: cari.type,
          current: 0,
          d0_30: 0,
          d31_60: 0,
          d61_90: 0,
          d90_plus: 0,
          total: 0,
        };
        map.set(cariId, entry);
      }

      const amount = Number(row['amount']) || 0;
      const dueDate = new Date(row['due_date'] as string);
      const daysLate = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);

      if (daysLate < 0) entry.current += amount;
      else if (daysLate <= 30) entry.d0_30 += amount;
      else if (daysLate <= 60) entry.d31_60 += amount;
      else if (daysLate <= 90) entry.d61_90 += amount;
      else entry.d90_plus += amount;

      entry.total += amount;
    }

    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  // ── Public: Expense Breakdown (donut) ──────────────────────────────────────
  async getExpenseBreakdown(firmId: string, year: number): Promise<ExpenseSliceRow[]> {
    const rows = await this.fetchMonthlyRows(firmId, year);
    const byCode = new Map<string, ExpenseSliceRow>();

    for (const r of rows) {
      if (r.account_type !== 'GIDER') continue;
      const code = r.parent_code ?? r.account_code;
      const name = r.parent_code
        ? rows.find(x => x.account_code === r.parent_code)?.account_name ?? code
        : r.account_name;

      const entry = byCode.get(code) ?? { code, name, amount: 0, percent: 0 };
      entry.amount += r.total_amount ?? 0;
      byCode.set(code, entry);
    }

    const slices = [...byCode.values()].sort((a, b) => b.amount - a.amount);
    const total = slices.reduce((s, x) => s + x.amount, 0);
    if (total > 0) {
      for (const s of slices) s.percent = (s.amount / total) * 100;
    }
    return slices;
  }

  // ── Public: Overdue Transactions ───────────────────────────────────────────
  async getOverdueTransactions(firmId: string): Promise<OverdueRow[]> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.client
      .from('transactions')
      .select(
        'id, type, amount, due_date, invoice_no, description, ' +
          'cari_accounts!inner(name, type, firm_id)'
      )
      .eq('firm_id', firmId)
      .eq('status', 'BEKLIYOR')
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching overdue:', error);
      return [];
    }

    const now = new Date(today);
    return (data as unknown as Array<Record<string, unknown>> ?? []).map(row => {
      const cariRaw = row['cari_accounts'];
      const cari = (Array.isArray(cariRaw) ? cariRaw[0] : cariRaw) as
        | { name: string; type: 'MUSTERI' | 'TEDARIKCI' }
        | null;
      const dueDate = new Date(row['due_date'] as string);
      const daysLate = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
      return {
        id: row['id'] as string,
        type: row['type'] as 'GELIR' | 'GIDER',
        amount: Number(row['amount']) || 0,
        due_date: row['due_date'] as string,
        days_late: daysLate,
        invoice_no: (row['invoice_no'] as string) ?? '',
        description: (row['description'] as string) ?? '',
        cari_name: cari?.name ?? '—',
        cari_type: cari?.type ?? 'MUSTERI',
      };
    });
  }

  // ── Public: P&L summary ───────────────────────────────────────────────────
  async getPnLSummary(firmId: string, year: number): Promise<PnLMonthSummary[]> {
    const rows = await this.fetchMonthlyRows(firmId, year);

    const monthMap: Record<number, PnLMonthSummary> = {};
    for (let m = 1; m <= 12; m++) {
      monthMap[m] = { month: m, totalGelir: 0, totalGider: 0, net: 0 };
    }

    for (const row of rows) {
      const s = monthMap[row.month];
      if (!s) continue;
      if (row.account_type === 'GELIR') {
        s.totalGelir += row.total_amount ?? 0;
      } else if (row.account_type === 'GIDER') {
        s.totalGider += row.total_amount ?? 0;
      }
    }

    for (let m = 1; m <= 12; m++) {
      const s = monthMap[m];
      s.net = s.totalGelir - s.totalGider;
    }

    return Object.values(monthMap);
  }
}
