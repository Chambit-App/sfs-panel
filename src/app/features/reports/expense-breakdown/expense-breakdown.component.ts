import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartData,
  ChartConfiguration,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, ExpenseSliceRow } from '../reports.service';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

@Component({
  selector: 'app-expense-breakdown',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, BaseChartDirective],
  templateUrl: './expense-breakdown.component.html',
  styleUrl: './expense-breakdown.component.scss',
})
export class ExpenseBreakdownComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  slices = signal<ExpenseSliceRow[]>([]);
  selectedYear = signal(new Date().getFullYear());
  yearOptions = [2024, 2025, 2026, 2027];

  total = computed(() => this.slices().reduce((s, x) => s + x.amount, 0));

  chartData = computed<ChartData<'doughnut'>>(() => {
    const data = this.slices();
    return {
      labels: data.map(s => s.name),
      datasets: [
        {
          data: data.map(s => s.amount),
          backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
          hoverOffset: 8,
          borderWidth: 0,
        },
      ],
    };
  });

  chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.raw as number;
            const total = (ctx.dataset.data as number[]).reduce((s, v) => s + v, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
            return `${ctx.label}: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(val)} ₺ (${pct}%)`;
          },
        },
      },
    },
  };

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id, this.selectedYear());
      else this.slices.set([]);
    });
  }

  async load(firmId: string, year: number): Promise<void> {
    this.loading.set(true);
    try {
      this.slices.set(await this.reportsService.getExpenseBreakdown(firmId, year));
    } finally {
      this.loading.set(false);
    }
  }

  onYearChange(y: number): void {
    this.selectedYear.set(Number(y));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(y));
  }

  colorFor(idx: number): string {
    return PALETTE[idx % PALETTE.length];
  }
}
