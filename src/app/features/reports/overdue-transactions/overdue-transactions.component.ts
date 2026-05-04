import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../../shared/pipes/turkish-date.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, OverdueRow } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

type TypeFilter = 'ALL' | 'GELIR' | 'GIDER';

@Component({
  selector: 'app-overdue-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, TurkishDatePipe],
  templateUrl: './overdue-transactions.component.html',
  styleUrl: './overdue-transactions.component.scss',
})
export class OverdueTransactionsComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  rows = signal<OverdueRow[]>([]);
  filterType = signal<TypeFilter>('ALL');

  filtered = computed(() => {
    const t = this.filterType();
    const items = this.rows();
    return t === 'ALL' ? items : items.filter(r => r.type === t);
  });

  totals = computed(() => {
    const items = this.filtered();
    const gelir = items.filter(r => r.type === 'GELIR').reduce((s, r) => s + r.amount, 0);
    const gider = items.filter(r => r.type === 'GIDER').reduce((s, r) => s + r.amount, 0);
    return {
      count: items.length,
      gelir,
      gider,
      maxLate: items.reduce((m, r) => Math.max(m, r.days_late), 0),
    };
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
      this.rows.set(await this.reportsService.getOverdueTransactions(firmId));
    } finally {
      this.loading.set(false);
    }
  }

  bucketClass(days: number): string {
    if (days <= 30) return 'bucket bucket--y';
    if (days <= 60) return 'bucket bucket--o';
    if (days <= 90) return 'bucket bucket--r';
    return 'bucket bucket--rd';
  }

  exportExcel(): void {
    const data = this.filtered().map(r => ({
      tip: r.type === 'GELIR' ? 'Tahsilat' : 'Ödeme',
      cari: r.cari_name,
      cari_tipi: r.cari_type === 'MUSTERI' ? 'Müşteri' : 'Tedarikçi',
      fatura_no: r.invoice_no,
      vade_tarihi: r.due_date,
      gecikme_gun: r.days_late,
      tutar: r.amount,
      aciklama: r.description,
    }));
    const blob = this.excel.exportTable(
      'Geciken İşlemler',
      [
        { key: 'tip', label: 'Tip' },
        { key: 'cari', label: 'Cari' },
        { key: 'cari_tipi', label: 'Cari Tipi' },
        { key: 'fatura_no', label: 'Fatura No' },
        { key: 'vade_tarihi', label: 'Vade Tarihi' },
        { key: 'gecikme_gun', label: 'Gecikme (Gün)' },
        { key: 'tutar', label: 'Tutar' },
        { key: 'aciklama', label: 'Açıklama' },
      ],
      data,
    );
    const stamp = new Date().toISOString().split('T')[0];
    this.excel.download(blob, `geciken_islemler_${stamp}.xlsx`);
  }
}
