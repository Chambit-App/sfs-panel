import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, CariAgingRow } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

type TypeFilter = 'ALL' | 'MUSTERI' | 'TEDARIKCI';

@Component({
  selector: 'app-cari-aging',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe],
  templateUrl: './cari-aging.component.html',
  styleUrl: './cari-aging.component.scss',
})
export class CariAgingComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  rows = signal<CariAgingRow[]>([]);
  filterType = signal<TypeFilter>('ALL');

  filtered = computed(() => {
    const t = this.filterType();
    const items = this.rows();
    return t === 'ALL' ? items : items.filter(r => r.cari_type === t);
  });

  totals = computed(() => {
    const items = this.filtered();
    return items.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        d0_30: acc.d0_30 + r.d0_30,
        d31_60: acc.d31_60 + r.d31_60,
        d61_90: acc.d61_90 + r.d61_90,
        d90_plus: acc.d90_plus + r.d90_plus,
        total: acc.total + r.total,
      }),
      { current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
    );
  });

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id);
      else this.rows.set([]);
    });
  }

  async load(firmId: string): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.reportsService.getCariAging(firmId));
    } finally {
      this.loading.set(false);
    }
  }

  exportExcel(): void {
    const data = this.filtered().map(r => ({
      cari: r.cari_name,
      tip: r.cari_type === 'MUSTERI' ? 'Müşteri' : 'Tedarikçi',
      vadesi_gelmemis: r.current,
      d0_30: r.d0_30,
      d31_60: r.d31_60,
      d61_90: r.d61_90,
      d90_plus: r.d90_plus,
      toplam: r.total,
    }));
    const blob = this.excel.exportTable(
      'Cari Yaşlandırma',
      [
        { key: 'cari', label: 'Cari' },
        { key: 'tip', label: 'Tip' },
        { key: 'vadesi_gelmemis', label: 'Vadesi Gelmemiş' },
        { key: 'd0_30', label: '0-30 Gün' },
        { key: 'd31_60', label: '31-60 Gün' },
        { key: 'd61_90', label: '61-90 Gün' },
        { key: 'd90_plus', label: '90+ Gün' },
        { key: 'toplam', label: 'Toplam' },
      ],
      data,
    );
    const stamp = new Date().toISOString().split('T')[0];
    this.excel.download(blob, `cari_yaslandirma_${stamp}.xlsx`);
  }
}
