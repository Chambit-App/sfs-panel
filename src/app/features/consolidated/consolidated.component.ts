import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
  PieController,
} from 'chart.js';
import { ChartConfiguration, ChartData } from 'chart.js';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { TenantService } from '../../core/services/tenant.service';
import {
  ConsolidatedService,
  ConsolidatedRow,
  FirmBreakdown,
  ConsolidatedKpis,
} from './consolidated.service';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
  PieController,
);

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const CHART_PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
  '#06b6d4', '#84cc16',
];

@Component({
  selector: 'app-consolidated',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    KpiCardComponent,
    BaseChartDirective,
  ],
  templateUrl: './consolidated.component.html',
  styleUrl: './consolidated.component.scss',
})
export class ConsolidatedComponent implements OnInit {
  private tenantService = inject(TenantService);
  private consolidatedService = inject(ConsolidatedService);

  // ── State ──────────────────────────────────────────────────────────────────
  loading = signal(false);
  activeTab = signal<'report' | 'comparison'>('report');
  selectedYear = signal(new Date().getFullYear());

  consolidatedRows = signal<ConsolidatedRow[]>([]);
  firmBreakdown = signal<FirmBreakdown[]>([]);
  kpis = signal<ConsolidatedKpis>({
    totalGelir: 0,
    totalGider: 0,
    net: 0,
    firmCount: 0,
    topRevenueFirm: '',
    topExpenseFirm: '',
  });

  // ── References ─────────────────────────────────────────────────────────────
  activeTenant = this.tenantService.activeTenant;
  activeFirm = this.tenantService.activeFirm;
  months = TURKISH_MONTHS;
  availableYears: number[] = [];
  currentYear = new Date().getFullYear();

  // ── Computed ───────────────────────────────────────────────────────────────
  gelirsRows = computed(() =>
    this.consolidatedRows().filter(r => r.account_type === 'GELIR')
  );
  giderRows = computed(() =>
    this.consolidatedRows().filter(r => r.account_type === 'GIDER')
  );

  totalGelirMonthly = computed(() => {
    const rows = this.gelirsRows();
    return Array.from({ length: 12 }, (_, i) =>
      rows.reduce((sum, r) => sum + (r.monthly[i] ?? 0), 0)
    );
  });
  totalGiderMonthly = computed(() => {
    const rows = this.giderRows();
    return Array.from({ length: 12 }, (_, i) =>
      rows.reduce((sum, r) => sum + (r.monthly[i] ?? 0), 0)
    );
  });
  netMonthly = computed(() =>
    this.totalGelirMonthly().map((g, i) => g - this.totalGiderMonthly()[i])
  );

  totalGelirAnnual = computed(() =>
    this.totalGelirMonthly().reduce((s, v) => s + v, 0)
  );
  totalGiderAnnual = computed(() =>
    this.totalGiderMonthly().reduce((s, v) => s + v, 0)
  );
  netAnnual = computed(() => this.totalGelirAnnual() - this.totalGiderAnnual());
  netTrend = computed(() => (this.kpis().net >= 0 ? 'up' : 'down') as 'up' | 'down');

  // ── Charts ─────────────────────────────────────────────────────────────────
  barChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  pieChartData = signal<ChartData<'pie'>>({ labels: [], datasets: [] });

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
            new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(val as number) + ' ₺',
        },
      },
    },
  };

  pieChartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.raw as number;
            const total = (ctx.dataset.data as number[]).reduce((s, v) => s + v, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
            return `${ctx.label}: ${new Intl.NumberFormat('tr-TR', {
              minimumFractionDigits: 2,
            }).format(val)} ₺ (${pct}%)`;
          },
        },
      },
    },
  };

  constructor() {
    // Build years array
    const base = new Date().getFullYear();
    this.availableYears = Array.from({ length: 5 }, (_, i) => base - i);

    // React to tenant changes
    effect(() => {
      const tenant = this.activeTenant();
      if (tenant) {
        this.loadAll(tenant.id, this.selectedYear());
      } else {
        this.resetData();
      }
    });
  }

  ngOnInit(): void {
    // Handled by effect
  }

  onYearChange(year: number): void {
    this.selectedYear.set(year);
    const tenant = this.activeTenant();
    if (tenant) {
      this.loadAll(tenant.id, year);
    }
  }

  setTab(tab: 'report' | 'comparison'): void {
    this.activeTab.set(tab);
  }

  private async loadAll(tenantId: string, year: number): Promise<void> {
    this.loading.set(true);
    try {
      const [rows, breakdown, kpis] = await Promise.all([
        this.consolidatedService.getConsolidatedReport(tenantId, year),
        this.consolidatedService.getFirmBreakdown(tenantId, year),
        this.consolidatedService.getConsolidatedKpis(tenantId, year),
      ]);

      this.consolidatedRows.set(rows);
      this.firmBreakdown.set(breakdown);
      this.kpis.set(kpis);

      this.buildBarChart(breakdown);
      this.buildPieChart(breakdown);
    } catch (err) {
      console.error('Consolidated load error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private resetData(): void {
    this.consolidatedRows.set([]);
    this.firmBreakdown.set([]);
    this.kpis.set({
      totalGelir: 0,
      totalGider: 0,
      net: 0,
      firmCount: 0,
      topRevenueFirm: '',
      topExpenseFirm: '',
    });
    this.barChartData.set({ labels: [], datasets: [] });
    this.pieChartData.set({ labels: [], datasets: [] });
  }

  private buildBarChart(breakdown: FirmBreakdown[]): void {
    if (breakdown.length === 0) {
      this.barChartData.set({ labels: [], datasets: [] });
      return;
    }
    this.barChartData.set({
      labels: breakdown.map(f => f.firm_name),
      datasets: [
        {
          label: 'Gelir',
          data: breakdown.map(f => f.total_gelir),
          backgroundColor: 'rgba(34, 197, 94, 0.75)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
        },
        {
          label: 'Gider',
          data: breakdown.map(f => f.total_gider),
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1,
        },
      ],
    });
  }

  private buildPieChart(breakdown: FirmBreakdown[]): void {
    const firmsWithRevenue = breakdown.filter(f => f.total_gelir > 0);
    if (firmsWithRevenue.length === 0) {
      this.pieChartData.set({ labels: [], datasets: [] });
      return;
    }
    this.pieChartData.set({
      labels: firmsWithRevenue.map(f => f.firm_name),
      datasets: [
        {
          data: firmsWithRevenue.map(f => f.total_gelir),
          backgroundColor: firmsWithRevenue.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          hoverOffset: 6,
        },
      ],
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
