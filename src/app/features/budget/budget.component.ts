import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { TenantService } from '../../core/services/tenant.service';
import { ChartOfAccounts } from '../../core/models/chart-of-accounts.model';
import {
  BudgetService,
  BudgetVsActualRow,
  BudgetMonthlySummary,
} from './budget.service';

const TURKISH_MONTHS_FULL = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const TURKISH_MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

/** Key: `accountId_month` => planned amount as string for editing */
type PlanGrid = Record<string, string>;

/** Grouped account rows for the planning grid */
interface AccountGroup {
  parentCode: string | null;
  parentName: string;
  type: 'GELIR' | 'GIDER';
  accounts: ChartOfAccounts[];
  collapsed: boolean;
}

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PageHeaderComponent, KpiCardComponent],
  templateUrl: './budget.component.html',
  styleUrl: './budget.component.scss',
})
export class BudgetComponent implements OnInit {
  private tenantService = inject(TenantService);
  private budgetService = inject(BudgetService);

  // ── State ────────────────────────────────────────────────
  activeTab = signal<'planning' | 'summary'>('planning');
  loading = signal(false);
  saving = signal(false);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);

  activeFirm = this.tenantService.activeFirm;
  firmName = computed(() => this.activeFirm()?.name ?? '');

  currentYear = new Date().getFullYear();
  selectedYear = signal(this.currentYear);

  typeFilter = signal<'ALL' | 'GELIR' | 'GIDER'>('ALL');

  accounts = signal<ChartOfAccounts[]>([]);
  budgetRows = signal<BudgetVsActualRow[]>([]);
  summaryData = signal<BudgetMonthlySummary[]>([]);

  /** The editable planned amounts grid keyed by `{accountId}_{month}` */
  planGrid = signal<PlanGrid>({});
  /** Track which cells have been modified */
  dirtyKeys = signal<Set<string>>(new Set());

  accountGroups = computed<AccountGroup[]>(() => {
    const accs = this.accounts();
    const filter = this.typeFilter();

    const filtered = filter === 'ALL' ? accs : accs.filter(a => a.type === filter);

    // Group by parent_code
    const groupMap = new Map<string, AccountGroup>();

    for (const acc of filtered) {
      const key = acc.parent_code ?? '__ROOT__';
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          parentCode: acc.parent_code,
          parentName: acc.parent_code ?? (acc.type === 'GELIR' ? 'Gelirler' : 'Giderler'),
          type: acc.type,
          accounts: [],
          collapsed: false,
        });
      }
      groupMap.get(key)!.accounts.push(acc);
    }

    // Sort groups: GELIR first then GIDER, then by parentCode
    return [...groupMap.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'GELIR' ? -1 : 1;
      return (a.parentCode ?? '').localeCompare(b.parentCode ?? '');
    });
  });

  months = Array.from({ length: 12 }, (_, i) => i + 1);
  monthsShort = TURKISH_MONTHS_SHORT;
  monthsFull = TURKISH_MONTHS_FULL;

  yearOptions = computed(() => {
    const y = this.currentYear;
    return [y - 1, y, y + 1, y + 2];
  });

  // KPI signals for summary tab
  annualKpis = computed(() => {
    const summary = this.summaryData();
    let totalPlannedGelir = 0;
    let totalActualGelir = 0;
    let totalPlannedGider = 0;
    let totalActualGider = 0;

    for (const s of summary) {
      totalPlannedGelir += s.totalPlannedGelir;
      totalActualGelir += s.totalActualGelir;
      totalPlannedGider += s.totalPlannedGider;
      totalActualGider += s.totalActualGider;
    }

    const netPlanned = totalPlannedGelir - totalPlannedGider;
    const netActual = totalActualGelir - totalActualGider;
    const variance = netActual - netPlanned;
    const variancePct = netPlanned !== 0 ? (variance / Math.abs(netPlanned)) * 100 : 0;

    return { totalPlannedGelir, totalActualGelir, totalPlannedGider, totalActualGider, netPlanned, netActual, variance, variancePct };
  });

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) {
        this.loadData(firm.id, this.selectedYear());
      } else {
        this.resetData();
      }
    });

    // Reload when year changes
    effect(() => {
      const year = this.selectedYear();
      const firm = this.activeFirm();
      if (firm && year) {
        this.loadData(firm.id, year);
      }
    });
  }

  ngOnInit(): void {}

  // ── Data loading ─────────────────────────────────────────

  private async loadData(firmId: string, year: number): Promise<void> {
    this.loading.set(true);
    this.dirtyKeys.set(new Set());

    try {
      const [accounts, budgetRows, summaryData] = await Promise.all([
        this.budgetService.getChartOfAccounts(firmId),
        this.budgetService.getBudgetVsActual(firmId, year),
        this.budgetService.getBudgetSummary(firmId, year),
      ]);

      this.accounts.set(accounts);
      this.budgetRows.set(budgetRows);
      this.summaryData.set(summaryData);

      // Build plan grid from existing data
      const grid: PlanGrid = {};
      for (const row of budgetRows) {
        const key = `${row.chart_account_id}_${row.month}`;
        grid[key] = row.planned_amount != null ? String(row.planned_amount) : '';
      }
      this.planGrid.set(grid);
    } catch (err) {
      console.error('Budget load error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private resetData(): void {
    this.accounts.set([]);
    this.budgetRows.set([]);
    this.summaryData.set([]);
    this.planGrid.set({});
    this.dirtyKeys.set(new Set());
  }

  // ── Grid helpers ─────────────────────────────────────────

  getPlanned(accountId: string, month: number): string {
    return this.planGrid()[`${accountId}_${month}`] ?? '';
  }

  getActual(accountId: string, month: number): number {
    const row = this.budgetRows().find(
      r => r.chart_account_id === accountId && r.month === month
    );
    return row?.actual_amount ?? 0;
  }

  getVariance(accountId: string, month: number): number {
    const planned = parseFloat(this.getPlanned(accountId, month)) || 0;
    const actual = this.getActual(accountId, month);
    return actual - planned;
  }

  getAnnualPlanned(accountId: string): number {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      total += parseFloat(this.getPlanned(accountId, m)) || 0;
    }
    return total;
  }

  getAnnualActual(accountId: string): number {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      total += this.getActual(accountId, m);
    }
    return total;
  }

  getGroupPlannedTotal(group: AccountGroup, month: number): number {
    return group.accounts.reduce((sum, acc) => {
      return sum + (parseFloat(this.getPlanned(acc.id, month)) || 0);
    }, 0);
  }

  getGroupActualTotal(group: AccountGroup, month: number): number {
    return group.accounts.reduce((sum, acc) => sum + this.getActual(acc.id, month), 0);
  }

  getGroupAnnualPlanned(group: AccountGroup): number {
    return group.accounts.reduce((sum, acc) => sum + this.getAnnualPlanned(acc.id), 0);
  }

  getGroupAnnualActual(group: AccountGroup): number {
    return group.accounts.reduce((sum, acc) => sum + this.getAnnualActual(acc.id), 0);
  }

  onCellInput(accountId: string, month: number, value: string): void {
    const key = `${accountId}_${month}`;
    const grid = { ...this.planGrid() };
    grid[key] = value;
    this.planGrid.set(grid);

    const dirty = new Set(this.dirtyKeys());
    dirty.add(key);
    this.dirtyKeys.set(dirty);
  }

  toggleGroup(group: AccountGroup): void {
    group.collapsed = !group.collapsed;
    // Force change detection by updating accounts signal
    this.accounts.update(a => [...a]);
  }

  // ── Save ─────────────────────────────────────────────────

  async savePlans(): Promise<void> {
    const firm = this.activeFirm();
    if (!firm) return;

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    try {
      const year = this.selectedYear();
      const grid = this.planGrid();
      const plans: { year: number; month: number; chart_account_id: string; planned_amount: number }[] = [];

      for (const [key, val] of Object.entries(grid)) {
        const amount = parseFloat(val);
        if (isNaN(amount) && val !== '') continue;

        const parts = key.split('_');
        const month = parseInt(parts[parts.length - 1], 10);
        const accountId = parts.slice(0, -1).join('_');

        plans.push({
          year,
          month,
          chart_account_id: accountId,
          planned_amount: isNaN(amount) ? 0 : amount,
        });
      }

      await this.budgetService.saveBudgetPlans(firm.id, plans);

      // Refresh data
      const [budgetRows, summaryData] = await Promise.all([
        this.budgetService.getBudgetVsActual(firm.id, year),
        this.budgetService.getBudgetSummary(firm.id, year),
      ]);
      this.budgetRows.set(budgetRows);
      this.summaryData.set(summaryData);
      this.dirtyKeys.set(new Set());
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (err: any) {
      this.saveError.set(err?.message ?? 'Kaydetme hatası oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  // ── UI helpers ───────────────────────────────────────────

  setTab(tab: 'planning' | 'summary'): void {
    this.activeTab.set(tab);
  }

  onYearChange(year: number): void {
    this.selectedYear.set(Number(year));
  }

  onTypeFilterChange(filter: 'ALL' | 'GELIR' | 'GIDER'): void {
    this.typeFilter.set(filter);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  formatVariancePct(pct: number | undefined): string {
    if (pct == null || isNaN(pct) || !isFinite(pct)) return '—';
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  }

  varianceClass(variance: number): string {
    if (variance > 0) return 'variance--positive';
    if (variance < 0) return 'variance--negative';
    return 'variance--zero';
  }

  summaryNetClass(net: number): string {
    if (net > 0) return 'net--positive';
    if (net < 0) return 'net--negative';
    return '';
  }

  getSummaryRow(month: number): BudgetMonthlySummary | undefined {
    return this.summaryData().find(s => s.month === month);
  }

  get hasDirtyChanges(): boolean {
    return this.dirtyKeys().size > 0;
  }

  trackByAccount(index: number, acc: ChartOfAccounts): string {
    return acc.id;
  }

  trackByGroup(index: number, group: AccountGroup): string {
    return group.parentCode ?? group.type;
  }

  trackByMonth(index: number, month: number): number {
    return month;
  }
}
