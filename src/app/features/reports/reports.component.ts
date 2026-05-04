import {
  Component,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { CurrencyTryPipe } from '../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../core/services/tenant.service';
import { ReportsService, MonthlyReportRow, YoYReportRow } from './reports.service';
import { AmountCellPipe } from './amount-cell.pipe';
import { ExcelService } from '../../core/services/excel.service';

const MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

type TabId = 'monthly' | 'yoy';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    PageHeaderComponent,
    KpiCardComponent,
    CurrencyTryPipe,
    AmountCellPipe,
    BaseChartDirective,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  // ── Constants ─────────────────────────────────────────────────────────────
  readonly MONTHS_SHORT = MONTHS_SHORT;
  readonly monthIndices = Array.from({ length: 12 }, (_, i) => i);
  /** colspan for YoY table section headers: code(1) + name(1) + 12*2 months + 2 totals + diff + pct = 30 */
  readonly yoyColspan = 30;

  readonly yearOptions: number[] = (() => {
    const current = new Date().getFullYear();
    const years: number[] = [];
    for (let y = current + 1; y >= current - 5; y--) {
      years.push(y);
    }
    return years;
  })();

  // ── Signals ───────────────────────────────────────────────────────────────
  loading = signal(false);
  activeTab = signal<TabId>('monthly');
  selectedYear = signal(new Date().getFullYear());
  yoyYear1 = signal(new Date().getFullYear() - 1);
  yoyYear2 = signal(new Date().getFullYear());

  monthlyRows = signal<MonthlyReportRow[]>([]);
  yoyRows = signal<YoYReportRow[]>([]);

  barChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });

  // ── Computed ──────────────────────────────────────────────────────────────
  activeFirm = this.tenantService.activeFirm;
  firmName = computed(() => this.activeFirm()?.name ?? '');

  gelirRows = computed(() =>
    this.monthlyRows().filter(r => r.type === 'GELIR')
  );

  giderRows = computed(() =>
    this.monthlyRows().filter(r => r.type === 'GIDER')
  );

  gelirMonthTotals = computed(() => {
    const rows = this.gelirRows().filter(r => !r.isGroupHeader);
    return Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + r.months[i], 0)
    );
  });

  giderMonthTotals = computed(() => {
    const rows = this.giderRows().filter(r => !r.isGroupHeader);
    return Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + r.months[i], 0)
    );
  });

  netMonthValues = computed(() => {
    const gelir = this.gelirMonthTotals();
    const gider = this.giderMonthTotals();
    return gelir.map((g, i) => g - gider[i]);
  });

  annualGelir = computed(() =>
    this.gelirRows().filter(r => !r.isGroupHeader).reduce((s, r) => s + r.total, 0)
  );

  annualGider = computed(() =>
    this.giderRows().filter(r => !r.isGroupHeader).reduce((s, r) => s + r.total, 0)
  );

  annualNet = computed(() => this.annualGelir() - this.annualGider());

  topExpense = computed(() => {
    const giderLeafs = this.giderRows().filter(r => !r.isGroupHeader);
    if (giderLeafs.length === 0) return null;
    return giderLeafs.reduce((max, r) => (r.total > max.total ? r : max), giderLeafs[0]);
  });

  yoyGelirRows = computed(() => this.yoyRows().filter(r => r.type === 'GELIR'));
  yoyGiderRows = computed(() => this.yoyRows().filter(r => r.type === 'GIDER'));

  // ── Chart options ─────────────────────────────────────────────────────────
  barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.raw as number;
            return `${ctx.dataset.label}: ${new Intl.NumberFormat('tr-TR', {
              minimumFractionDigits: 2,
            }).format(val)} ₺`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        ticks: {
          callback: val =>
            new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(
              val as number
            ) + ' ₺',
        },
      },
    },
  };

  // ── Constructor / Effects ─────────────────────────────────────────────────
  constructor() {
    // React to firm changes
    effect(() => {
      const firm = this.activeFirm();
      if (firm) {
        this.loadMonthly(firm.id, this.selectedYear());
      } else {
        this.monthlyRows.set([]);
        this.yoyRows.set([]);
        this.barChartData.set({ labels: [], datasets: [] });
      }
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    const firm = this.activeFirm();
    if (!firm) return;
    if (tab === 'monthly') {
      this.loadMonthly(firm.id, this.selectedYear());
    } else {
      this.loadYoY(firm.id, this.yoyYear1(), this.yoyYear2());
    }
  }

  onYearChange(year: number): void {
    this.selectedYear.set(Number(year));
    const firm = this.activeFirm();
    if (firm) this.loadMonthly(firm.id, Number(year));
  }

  onYoyYear1Change(year: number): void {
    this.yoyYear1.set(Number(year));
    const firm = this.activeFirm();
    if (firm) this.loadYoY(firm.id, Number(year), this.yoyYear2());
  }

  onYoyYear2Change(year: number): void {
    this.yoyYear2.set(Number(year));
    const firm = this.activeFirm();
    if (firm) this.loadYoY(firm.id, this.yoyYear1(), Number(year));
  }

  // ── Data loaders ──────────────────────────────────────────────────────────
  private async loadMonthly(firmId: string, year: number): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.reportsService.getMonthlyReport(firmId, year);
      this.monthlyRows.set(rows);
      this.buildBarChart();
    } catch (err) {
      console.error('Monthly report error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadYoY(
    firmId: string,
    year1: number,
    year2: number
  ): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.reportsService.getYearOverYearReport(firmId, year1, year2);
      this.yoyRows.set(rows);
    } catch (err) {
      console.error('YoY report error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private buildBarChart(): void {
    const gelir = this.gelirMonthTotals();
    const gider = this.giderMonthTotals();

    this.barChartData.set({
      labels: MONTHS_SHORT,
      datasets: [
        {
          label: 'Gelir',
          data: gelir,
          backgroundColor: 'rgba(46, 204, 113, 0.75)',
          borderColor: 'rgba(46, 204, 113, 1)',
          borderWidth: 1,
        },
        {
          label: 'Gider',
          data: gider,
          backgroundColor: 'rgba(231, 76, 60, 0.75)',
          borderColor: 'rgba(231, 76, 60, 1)',
          borderWidth: 1,
        },
      ],
    });
  }

  exportExcel(): void {
    if (this.activeTab() === 'monthly') {
      this.exportMonthly();
    } else {
      this.exportYoY();
    }
  }

  private exportMonthly(): void {
    const cols = [
      { key: 'kod', label: 'Kod' },
      { key: 'hesap', label: 'Hesap' },
      { key: 'tip', label: 'Tip' },
      ...MONTHS_SHORT.map((m, i) => ({ key: `m${i}`, label: m })),
      { key: 'toplam', label: 'Yıllık Toplam' },
    ];
    const data = this.monthlyRows().map(r => {
      const row: Record<string, unknown> = {
        kod: r.code,
        hesap: r.name,
        tip: r.type,
        toplam: r.total,
      };
      r.months.forEach((v, i) => { row[`m${i}`] = v; });
      return row;
    });
    const blob = this.excel.exportTable('Aylık Gelir-Gider', cols, data);
    this.excel.download(blob, `gelir_gider_${this.selectedYear()}.xlsx`);
  }

  private exportYoY(): void {
    const y1 = this.yoyYear1();
    const y2 = this.yoyYear2();
    const cols = [
      { key: 'kod', label: 'Kod' },
      { key: 'hesap', label: 'Hesap' },
      { key: 'tip', label: 'Tip' },
      { key: 'y1_total', label: `${y1} Toplam` },
      { key: 'y2_total', label: `${y2} Toplam` },
      { key: 'fark', label: 'Fark' },
      { key: 'fark_yuzde', label: 'Fark (%)' },
    ];
    const data = this.yoyRows().map(r => ({
      kod: r.code,
      hesap: r.name,
      tip: r.type,
      y1_total: r.year1Total,
      y2_total: r.year2Total,
      fark: r.diff,
      fark_yuzde: r.diffPct === null ? '' : Number(r.diffPct.toFixed(2)),
    }));
    const blob = this.excel.exportTable('Yıllık Karşılaştırma', cols, data);
    this.excel.download(blob, `gelir_gider_yoy_${y1}_${y2}.xlsx`);
  }
}
