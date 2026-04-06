import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { TenantService } from '../../core/services/tenant.service';
import { DashboardService, KpiSummary, MonthlyTrendItem, BankBalance } from './dashboard.service';
import { Transaction } from '../../core/models/transaction.model';

const TURKISH_MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private tenantService = inject(TenantService);
  private dashboardService = inject(DashboardService);

  // State signals
  loading = signal(false);
  kpi = signal<KpiSummary>({
    totalGelir: 0,
    totalGider: 0,
    netKarZarar: 0,
    totalBankBalance: 0,
    overdueCount: 0,
    overdueAmount: 0,
  });
  monthlyTrend = signal<MonthlyTrendItem[]>([]);
  bankBalances = signal<BankBalance[]>([]);
  upcomingPayments = signal<Transaction[]>([]);
  overduePayments = signal<Transaction[]>([]);

  // Derived
  activeFirm = this.tenantService.activeFirm;
  firmName = computed(() => this.activeFirm()?.name ?? '');
  netTrend = computed(() => (this.kpi().netKarZarar >= 0 ? 'up' : 'down') as 'up' | 'down');
  currentYear = new Date().getFullYear();

  // Chart data
  barChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  doughnutChartData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });

  barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.raw as number;
            return `${ctx.dataset.label}: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(val)} ₺`;
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

  doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.raw as number;
            return `${ctx.label}: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(val)} ₺`;
          },
        },
      },
    },
  };

  constructor() {
    // React to firm changes
    effect(() => {
      const firm = this.activeFirm();
      if (firm) {
        this.loadDashboardData(firm.id);
      } else {
        this.resetData();
      }
    });
  }

  ngOnInit(): void {
    // Initial load handled by effect
  }

  private async loadDashboardData(firmId: string): Promise<void> {
    this.loading.set(true);
    try {
      const currentYear = new Date().getFullYear();
      const [kpi, trend, banks, upcoming, overdue] = await Promise.all([
        this.dashboardService.getKpiSummary(firmId),
        this.dashboardService.getMonthlyTrend(firmId, currentYear),
        this.dashboardService.getBankBalances(firmId),
        this.dashboardService.getUpcomingPayments(firmId, 7),
        this.dashboardService.getOverduePayments(firmId),
      ]);

      this.kpi.set(kpi);
      this.monthlyTrend.set(trend);
      this.bankBalances.set(banks);
      this.upcomingPayments.set(upcoming);
      this.overduePayments.set(overdue);

      this.buildBarChart(trend);
      this.buildDoughnutChart(banks);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private resetData(): void {
    this.kpi.set({
      totalGelir: 0,
      totalGider: 0,
      netKarZarar: 0,
      totalBankBalance: 0,
      overdueCount: 0,
      overdueAmount: 0,
    });
    this.monthlyTrend.set([]);
    this.bankBalances.set([]);
    this.upcomingPayments.set([]);
    this.overduePayments.set([]);
    this.barChartData.set({ labels: [], datasets: [] });
    this.doughnutChartData.set({ labels: [], datasets: [] });
  }

  private buildBarChart(trend: MonthlyTrendItem[]): void {
    const labels = trend.map(t => TURKISH_MONTHS[t.month - 1]);
    this.barChartData.set({
      labels,
      datasets: [
        {
          label: 'Gelir',
          data: trend.map(t => t.gelir),
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
        },
        {
          label: 'Gider',
          data: trend.map(t => t.gider),
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1,
        },
      ],
    });
  }

  private buildDoughnutChart(banks: BankBalance[]): void {
    if (banks.length === 0) {
      this.doughnutChartData.set({ labels: [], datasets: [] });
      return;
    }

    const palette = [
      '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
      '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
    ];

    this.doughnutChartData.set({
      labels: banks.map(b => b.bank_name),
      datasets: [
        {
          data: banks.map(b => b.balance),
          backgroundColor: banks.map((_, i) => palette[i % palette.length]),
          hoverOffset: 6,
        },
      ],
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + ' ₺';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR');
  }

  getDaysOverdue(dueDateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    const diff = today.getTime() - due.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }
}
