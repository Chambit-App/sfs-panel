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
  Filler,
} from 'chart.js';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, TrendMonth } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

@Component({
  selector: 'app-rolling-trend',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, BaseChartDirective],
  templateUrl: './rolling-trend.component.html',
  styleUrl: './rolling-trend.component.scss',
})
export class RollingTrendComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  trend = signal<TrendMonth[]>([]);
  windowMonths = signal<number>(12);
  windowOptions = [3, 6, 12];

  totals = computed(() => {
    const t = this.trend();
    const gelir = t.reduce((s, m) => s + m.gelir, 0);
    const gider = t.reduce((s, m) => s + m.gider, 0);
    const net = gelir - gider;
    const avgMonthlyGelir = t.length > 0 ? gelir / t.length : 0;
    const avgMonthlyGider = t.length > 0 ? gider / t.length : 0;
    return { gelir, gider, net, avgMonthlyGelir, avgMonthlyGider };
  });

  chartData = computed<ChartData<'line'>>(() => {
    const t = this.trend();
    return {
      labels: t.map(m => m.label),
      datasets: [
        {
          label: 'Gelir',
          data: t.map(m => m.gelir),
          borderColor: 'rgb(22, 163, 74)',
          backgroundColor: 'rgba(46, 204, 113, 0.15)',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Gider',
          data: t.map(m => m.gider),
          borderColor: 'rgb(220, 38, 38)',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Net',
          data: t.map(m => m.net),
          borderColor: 'rgb(67, 56, 202)',
          backgroundColor: 'rgba(99, 102, 241, 0.10)',
          borderDash: [4, 3],
          tension: 0.3,
          fill: false,
        },
      ],
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
      if (firm) this.load(firm.id, this.windowMonths());
      else this.trend.set([]);
    });
  }

  async load(firmId: string, months: number): Promise<void> {
    this.loading.set(true);
    try {
      this.trend.set(await this.reportsService.getRollingTrend(firmId, months));
    } finally {
      this.loading.set(false);
    }
  }

  onWindowChange(m: number): void {
    this.windowMonths.set(Number(m));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(m));
  }

  exportExcel(): void {
    const data = this.trend().map(m => ({
      ay: m.label,
      gelir: m.gelir,
      gider: m.gider,
      net: m.net,
    }));
    const blob = this.excel.exportTable(
      'Aylık Trend',
      [
        { key: 'ay', label: 'Ay' },
        { key: 'gelir', label: 'Gelir' },
        { key: 'gider', label: 'Gider' },
        { key: 'net', label: 'Net' },
      ],
      data,
    );
    this.excel.download(blob, `aylik_trend_son${this.windowMonths()}ay.xlsx`);
  }
}
