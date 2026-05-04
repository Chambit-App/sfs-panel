import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, ScheduleRow, ScheduleStatusFilter } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

const MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

@Component({
  selector: 'app-payment-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe],
  templateUrl: './payment-schedule.component.html',
  styleUrl: './payment-schedule.component.scss',
})
export class PaymentScheduleComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  rows = signal<ScheduleRow[]>([]);
  selectedYear = signal(new Date().getFullYear());
  statusFilter = signal<ScheduleStatusFilter>('ALL_OPEN');
  yearOptions = [2024, 2025, 2026, 2027];

  monthLabels = MONTHS;

  gelirRows = computed(() => this.rows().filter(r => r.type === 'GELIR'));
  giderRows = computed(() => this.rows().filter(r => r.type === 'GIDER'));

  gelirMonthTotals = computed(() => this.sumByMonth(this.gelirRows()));
  giderMonthTotals = computed(() => this.sumByMonth(this.giderRows()));
  netMonthTotals = computed(() => {
    const g = this.gelirMonthTotals();
    const e = this.giderMonthTotals();
    return g.map((v, i) => v - e[i]);
  });

  gelirAnnual = computed(() => this.gelirRows().reduce((s, r) => s + r.total, 0));
  giderAnnual = computed(() => this.giderRows().reduce((s, r) => s + r.total, 0));
  netAnnual = computed(() => this.gelirAnnual() - this.giderAnnual());

  gelirPending = computed(() => this.gelirRows().reduce((s, r) => s + r.totalPending, 0));
  giderPending = computed(() => this.giderRows().reduce((s, r) => s + r.totalPending, 0));

  private sumByMonth(rows: ScheduleRow[]): number[] {
    return Array.from({ length: 12 }, (_, m) =>
      rows.reduce((s, r) => s + r.monthly[m], 0),
    );
  }

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id, this.selectedYear(), this.statusFilter());
      else this.rows.set([]);
    });
  }

  async load(
    firmId: string,
    year: number,
    statusFilter: ScheduleStatusFilter,
  ): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.reportsService.getPaymentSchedule(firmId, year, statusFilter));
    } finally {
      this.loading.set(false);
    }
  }

  onYearChange(y: number): void {
    this.selectedYear.set(Number(y));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(y), this.statusFilter());
  }

  onStatusChange(s: ScheduleStatusFilter): void {
    this.statusFilter.set(s);
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, this.selectedYear(), s);
  }

  pendingPctOf(row: ScheduleRow, monthIdx: number): number {
    const total = row.monthly[monthIdx];
    const pending = row.monthlyPending[monthIdx];
    if (total <= 0) return 0;
    return Math.min(100, (pending / total) * 100);
  }

  hasPending(row: ScheduleRow, monthIdx: number): boolean {
    return row.monthlyPending[monthIdx] > 0 && this.statusFilter() !== 'PAID';
  }

  exportExcel(): void {
    const cols = [
      { key: 'kod', label: 'Kod' },
      { key: 'hesap', label: 'Hesap' },
      { key: 'tip', label: 'Tip' },
      ...MONTHS.map((m, i) => ({ key: `m${i}`, label: m })),
      { key: 'toplam', label: 'Yıllık Toplam' },
      { key: 'bekleyen', label: 'Bekleyen' },
    ];
    const data = this.rows().map(r => {
      const row: Record<string, unknown> = {
        kod: r.code,
        hesap: r.name,
        tip: r.type,
        toplam: r.total,
        bekleyen: r.totalPending,
      };
      r.monthly.forEach((v, i) => { row[`m${i}`] = v; });
      return row;
    });
    const blob = this.excel.exportTable('Ödeme Takvimi', cols, data);
    this.excel.download(blob, `odeme_takvimi_${this.selectedYear()}.xlsx`);
  }
}
