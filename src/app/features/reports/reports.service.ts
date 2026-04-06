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
