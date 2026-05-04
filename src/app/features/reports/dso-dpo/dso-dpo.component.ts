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
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, DsoDpoMonth } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

@Component({
  selector: 'app-dso-dpo',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, BaseChartDirective],
  templateUrl: './dso-dpo.component.html',
  styleUrl: './dso-dpo.component.scss',
})
export class DsoDpoComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  data = signal<DsoDpoMonth[]>([]);
  windowMonths = signal(12);
  windowOptions = [6, 12, 24];

  averages = computed(() => {
    const months = this.data();
    const dsoVals = months.map(m => m.dso).filter((v): v is number => v !== null);
    const dpoVals = months.map(m => m.dpo).filter((v): v is number => v !== null);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const avgDso = avg(dsoVals);
    const avgDpo = avg(dpoVals);
    const gap = avgDso !== null && avgDpo !== null ? avgDso - avgDpo : null;
    return { avgDso, avgDpo, gap };
  });

  chartData = computed<ChartData<'line'>>(() => {
    const m = this.data();
    return {
      labels: m.map(x => x.label),
      datasets: [
        {
          label: 'DSO (Tahsilat Süresi)',
          data: m.map(x => x.dso),
          borderColor: 'rgb(67, 56, 202)',
          backgroundColor: 'rgba(99, 102, 241, 0.10)',
          tension: 0.3,
          spanGaps: true,
        },
        {
          label: 'DPO (Ödeme Süresi)',
          data: m.map(x => x.dpo),
          borderColor: 'rgb(220, 38, 38)',
          backgroundColor: 'rgba(239, 68, 68, 0.10)',
          tension: 0.3,
          spanGaps: true,
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
            const v = ctx.raw as number | null;
            if (v === null) return `${ctx.dataset.label}: veri yok`;
            return `${ctx.dataset.label}: ${v} gün`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { callback: val => `${val} gün` },
      },
    },
  };

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id, this.windowMonths());
      else this.data.set([]);
    });
  }

  async load(firmId: string, months: number): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.reportsService.getDsoDpoTrend(firmId, months));
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
    const rows = this.data().map(m => ({
      ay: m.label,
      dso: m.dso ?? '',
      dpo: m.dpo ?? '',
      tahsilat_sayisi: m.receivableCount,
      odeme_sayisi: m.payableCount,
    }));
    const blob = this.excel.exportTable(
      'DSO DPO',
      [
        { key: 'ay', label: 'Ay' },
        { key: 'dso', label: 'DSO (gün)' },
        { key: 'dpo', label: 'DPO (gün)' },
        { key: 'tahsilat_sayisi', label: 'Tahsilat Sayısı' },
        { key: 'odeme_sayisi', label: 'Ödeme Sayısı' },
      ],
      rows,
    );
    this.excel.download(blob, `dso_dpo_son${this.windowMonths()}ay.xlsx`);
  }
}
