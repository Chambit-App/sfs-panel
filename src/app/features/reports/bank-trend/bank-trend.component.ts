import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartData,
  ChartConfiguration,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, BankTrendRow } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

@Component({
  selector: 'app-bank-trend',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, BaseChartDirective],
  templateUrl: './bank-trend.component.html',
  styleUrl: './bank-trend.component.scss',
})
export class BankTrendComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  rows = signal<BankTrendRow[]>([]);
  selectedYear = signal(new Date().getFullYear());
  yearOptions = [2024, 2025, 2026, 2027];

  monthLabels = MONTHS;

  totalsByMonth = computed(() => {
    const r = this.rows();
    return MONTHS.map((_, m) => r.reduce((s, row) => s + row.monthly[m], 0));
  });

  yearEndTotal = computed(() => {
    const t = this.totalsByMonth();
    return t[t.length - 1] ?? 0;
  });

  chartData = computed<ChartData<'line'>>(() => {
    const r = this.rows();
    return {
      labels: MONTHS,
      datasets: r.map((row, i) => ({
        label: row.bank_name,
        data: row.monthly,
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length] + '22',
        tension: 0.3,
        fill: false,
      })),
    };
  });

  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const v = ctx.raw as number;
            return `${ctx.dataset.label}: ${new Intl.NumberFormat('tr-TR', {
              minimumFractionDigits: 2,
            }).format(v)} ₺`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        ticks: {
          callback: val =>
            new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(val as number) + ' ₺',
        },
      },
    },
  };

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
      this.rows.set(await this.reportsService.getBankBalanceTrend(firmId, year));
    } finally {
      this.loading.set(false);
    }
  }

  onYearChange(y: number): void {
    this.selectedYear.set(Number(y));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(y));
  }

  exportExcel(): void {
    const cols = [
      { key: 'banka', label: 'Banka' },
      ...MONTHS.map((m, i) => ({ key: `m${i}`, label: m })),
      { key: 'son', label: 'Yıl Sonu Bakiye' },
    ];
    const data = this.rows().map(r => {
      const row: Record<string, unknown> = { banka: r.bank_name };
      r.monthly.forEach((v, i) => { row[`m${i}`] = v; });
      row['son'] = r.monthly[r.monthly.length - 1];
      return row;
    });
    const blob = this.excel.exportTable('Banka Bakiye Trendi', cols, data);
    this.excel.download(blob, `banka_bakiye_trendi_${this.selectedYear()}.xlsx`);
  }
}
