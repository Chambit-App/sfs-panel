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

// ── Top cari row (per type) ──────────────────────────────────────────────────
export interface TopCariRow {
  cari_id: string;
  cari_name: string;
  cari_type: 'MUSTERI' | 'TEDARIKCI';
  total_amount: number;
  transaction_count: number;
}

// ── Rolling trend month ──────────────────────────────────────────────────────
export interface TrendMonth {
  year: number;
  month: number;
  label: string;       // e.g. "Mayıs 2026"
  gelir: number;
  gider: number;
  net: number;
}

// ── Bank balance trend ───────────────────────────────────────────────────────
export interface BankTrendRow {
  bank_id: string;
  bank_name: string;
  monthly: number[];    // 12 entries, cumulative balance at end of each month
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

  // ── Public: Top cariler (per type) ─────────────────────────────────────────
  async getTopCariler(firmId: string, year: number, limit = 10): Promise<{
    musteri: TopCariRow[];
    tedarikci: TopCariRow[];
  }> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data, error } = await this.client
      .from('transactions')
      .select('cari_id, type, amount, cari_accounts!inner(name, type, firm_id)')
      .eq('firm_id', firmId)
      .neq('status', 'IPTAL')
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (error) {
      console.error('Error fetching top cariler:', error);
      return { musteri: [], tedarikci: [] };
    }

    const map = new Map<string, TopCariRow>();
    for (const row of (data as unknown as Array<Record<string, unknown>> ?? [])) {
      const cariRaw = row['cari_accounts'];
      const cari = (Array.isArray(cariRaw) ? cariRaw[0] : cariRaw) as
        | { name: string; type: 'MUSTERI' | 'TEDARIKCI' }
        | null;
      if (!cari) continue;

      const cariId = row['cari_id'] as string;
      const txnType = row['type'] as 'GELIR' | 'GIDER';
      const amount = Number(row['amount']) || 0;

      // Müşteri için sadece GELIR; Tedarikçi için sadece GIDER
      if (cari.type === 'MUSTERI' && txnType !== 'GELIR') continue;
      if (cari.type === 'TEDARIKCI' && txnType !== 'GIDER') continue;

      let entry = map.get(cariId);
      if (!entry) {
        entry = {
          cari_id: cariId,
          cari_name: cari.name,
          cari_type: cari.type,
          total_amount: 0,
          transaction_count: 0,
        };
        map.set(cariId, entry);
      }
      entry.total_amount += amount;
      entry.transaction_count += 1;
    }

    const all = [...map.values()];
    const musteri = all
      .filter(c => c.cari_type === 'MUSTERI')
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, limit);
    const tedarikci = all
      .filter(c => c.cari_type === 'TEDARIKCI')
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, limit);

    return { musteri, tedarikci };
  }

  // ── Public: Rolling trend (last N months) ──────────────────────────────────
  async getRollingTrend(firmId: string, months = 12): Promise<TrendMonth[]> {
    const today = new Date();
    const result: TrendMonth[] = [];
    const monthLabels = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ];

    // Build empty buckets for the last `months` months
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      result.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${monthLabels[d.getMonth()]} ${d.getFullYear()}`,
        gelir: 0,
        gider: 0,
        net: 0,
      });
    }

    const startDate = `${result[0].year}-${String(result[0].month).padStart(2, '0')}-01`;
    const lastBucket = result[result.length - 1];
    const lastDay = new Date(lastBucket.year, lastBucket.month, 0).getDate();
    const endDate = `${lastBucket.year}-${String(lastBucket.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await this.client
      .from('transactions')
      .select('type, amount, invoice_date')
      .eq('firm_id', firmId)
      .neq('status', 'IPTAL')
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (error) {
      console.error('Error fetching rolling trend:', error);
      return result;
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const date = new Date(row['invoice_date'] as string);
      const bucket = result.find(
        b => b.year === date.getFullYear() && b.month === date.getMonth() + 1,
      );
      if (!bucket) continue;
      const amount = Number(row['amount']) || 0;
      if (row['type'] === 'GELIR') bucket.gelir += amount;
      else if (row['type'] === 'GIDER') bucket.gider += amount;
    }

    for (const b of result) b.net = b.gelir - b.gider;
    return result;
  }

  // ── Public: Bank balance trend (12 monthly cumulative balances) ────────────
  async getBankBalanceTrend(firmId: string, year: number): Promise<BankTrendRow[]> {
    // Fetch all banks
    const { data: banksData, error: bankErr } = await this.client
      .from('bank_accounts')
      .select('id, bank_name')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .order('bank_name');
    if (bankErr) {
      console.error('Error fetching banks:', bankErr);
      return [];
    }
    const banks = (banksData ?? []) as Array<{ id: string; bank_name: string }>;
    if (banks.length === 0) return [];

    // Fetch all paid transactions up to end of `year` (cumulative requires history)
    const endOfYear = `${year}-12-31`;
    const { data: txnData } = await this.client
      .from('transactions')
      .select('bank_id, type, amount, invoice_date, status')
      .eq('firm_id', firmId)
      .eq('status', 'ODENDI')
      .lte('invoice_date', endOfYear)
      .not('bank_id', 'is', null);

    const { data: trData } = await this.client
      .from('bank_transfers')
      .select('from_bank_id, to_bank_id, amount, transfer_date')
      .eq('firm_id', firmId)
      .lte('transfer_date', endOfYear);

    const result: BankTrendRow[] = banks.map(b => ({
      bank_id: b.id,
      bank_name: b.bank_name,
      monthly: Array(12).fill(0),
    }));

    // Compute month-by-month delta then cumulative
    // Each bank: an array of 12 deltas (Jan..Dec of `year`), plus prior balance from earlier years
    const bankIndex = new Map(result.map((r, i) => [r.bank_id, i]));
    const priorBalances = new Map<string, number>(banks.map(b => [b.id, 0]));
    const monthlyDeltas: Map<string, number[]> = new Map(
      banks.map(b => [b.id, Array(12).fill(0)]),
    );

    const applyTxn = (bankId: string, amount: number, date: Date) => {
      if (date.getFullYear() < year) {
        priorBalances.set(bankId, (priorBalances.get(bankId) ?? 0) + amount);
      } else if (date.getFullYear() === year) {
        const m = date.getMonth();
        const arr = monthlyDeltas.get(bankId);
        if (arr) arr[m] += amount;
      }
    };

    for (const t of (txnData ?? []) as Array<Record<string, unknown>>) {
      const bankId = t['bank_id'] as string;
      if (!bankId || !bankIndex.has(bankId)) continue;
      const amount = Number(t['amount']) || 0;
      const sign = t['type'] === 'GELIR' ? 1 : -1;
      applyTxn(bankId, sign * amount, new Date(t['invoice_date'] as string));
    }

    for (const tr of (trData ?? []) as Array<Record<string, unknown>>) {
      const fromId = tr['from_bank_id'] as string;
      const toId = tr['to_bank_id'] as string;
      const amount = Number(tr['amount']) || 0;
      const d = new Date(tr['transfer_date'] as string);
      if (fromId && bankIndex.has(fromId)) applyTxn(fromId, -amount, d);
      if (toId && bankIndex.has(toId)) applyTxn(toId, amount, d);
    }

    for (const r of result) {
      const deltas = monthlyDeltas.get(r.bank_id) ?? Array(12).fill(0);
      let running = priorBalances.get(r.bank_id) ?? 0;
      for (let m = 0; m < 12; m++) {
        running += deltas[m];
        r.monthly[m] = running;
      }
    }

    return result;
  }
}
