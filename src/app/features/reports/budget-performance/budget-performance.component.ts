import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, BudgetVsActualRow } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

interface AccountSummary {
  code: string;
  name: string;
  type: 'GELIR' | 'GIDER';
  planned: number;
  actual: number;
  variance: number;
  variancePct: number;
}

@Component({
  selector: 'app-budget-performance',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe],
  templateUrl: './budget-performance.component.html',
  styleUrl: './budget-performance.component.scss',
})
export class BudgetPerformanceComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  rows = signal<BudgetVsActualRow[]>([]);
  selectedYear = signal(new Date().getFullYear());
  selectedMonth = signal<number | 'ALL'>('ALL');
  filterType = signal<'ALL' | 'GELIR' | 'GIDER'>('ALL');

  monthOptions = [...Array(12).keys()].map(i => ({ value: i + 1, label: MONTHS[i] }));
  yearOptions = [2024, 2025, 2026, 2027];

  accountSummaries = computed<AccountSummary[]>(() => {
    const month = this.selectedMonth();
    const type = this.filterType();
    const filtered = this.rows().filter(r => {
      if (month !== 'ALL' && r.month !== month) return false;
      if (type !== 'ALL' && r.account_type !== type) return false;
      return true;
    });

    const map = new Map<string, AccountSummary>();
    for (const r of filtered) {
      let entry = map.get(r.account_code);
      if (!entry) {
        entry = {
          code: r.account_code,
          name: r.account_name,
          type: r.account_type,
          planned: 0,
          actual: 0,
          variance: 0,
          variancePct: 0,
        };
        map.set(r.account_code, entry);
      }
      entry.planned += r.planned_amount ?? 0;
      entry.actual += r.actual_amount ?? 0;
    }

    for (const a of map.values()) {
      a.variance = a.actual - a.planned;
      a.variancePct = a.planned !== 0 ? (a.variance / Math.abs(a.planned)) * 100 : 0;
    }

    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  });

  totals = computed(() => {
    const items = this.accountSummaries();
    const planned = items.reduce((s, x) => s + x.planned, 0);
    const actual = items.reduce((s, x) => s + x.actual, 0);
    const variance = actual - planned;
    const variancePct = planned !== 0 ? (variance / Math.abs(planned)) * 100 : 0;
    return { planned, actual, variance, variancePct };
  });

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id, this.selectedYear());
      else this.rows.set([]);
    });
  }

  async load(firmId: string, year: number): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.reportsService.getBudgetVsActual(firmId, year));
    } finally {
      this.loading.set(false);
    }
  }

  onYearChange(y: number): void {
    this.selectedYear.set(Number(y));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(y));
  }

  onMonthChange(m: number | 'ALL'): void {
    this.selectedMonth.set(m === 'ALL' ? 'ALL' : Number(m));
  }

  rowVarianceClass(a: AccountSummary): string {
    // For GIDER, over-budget is bad (red); for GELIR, over is good (green)
    if (a.variance === 0) return '';
    const overBudget = a.variance > 0;
    if (a.type === 'GIDER') return overBudget ? 'bad' : 'good';
    return overBudget ? 'good' : 'bad';
  }

  exportExcel(): void {
    const data = this.accountSummaries().map(a => ({
      kod: a.code,
      hesap: a.name,
      tip: a.type,
      planlanan: a.planned,
      gerceklesen: a.actual,
      sapma: a.variance,
      sapma_yuzde: Number(a.variancePct.toFixed(2)),
    }));
    const blob = this.excel.exportTable(
      'Bütçe Performans',
      [
        { key: 'kod', label: 'Kod' },
        { key: 'hesap', label: 'Hesap' },
        { key: 'tip', label: 'Tip' },
        { key: 'planlanan', label: 'Planlanan' },
        { key: 'gerceklesen', label: 'Gerçekleşen' },
        { key: 'sapma', label: 'Sapma' },
        { key: 'sapma_yuzde', label: 'Sapma (%)' },
      ],
      data,
    );
    const monthSuffix = this.selectedMonth() === 'ALL' ? 'yillik' : `ay${this.selectedMonth()}`;
    this.excel.download(blob, `butce_performans_${this.selectedYear()}_${monthSuffix}.xlsx`);
  }
}
