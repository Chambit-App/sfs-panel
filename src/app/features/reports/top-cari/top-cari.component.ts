import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, TopCariRow } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';

@Component({
  selector: 'app-top-cari',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe],
  templateUrl: './top-cari.component.html',
  styleUrl: './top-cari.component.scss',
})
export class TopCariComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);
  musteri = signal<TopCariRow[]>([]);
  tedarikci = signal<TopCariRow[]>([]);
  selectedYear = signal(new Date().getFullYear());
  yearOptions = [2024, 2025, 2026, 2027];

  musteriTotal = computed(() => this.musteri().reduce((s, c) => s + c.total_amount, 0));
  tedarikciTotal = computed(() => this.tedarikci().reduce((s, c) => s + c.total_amount, 0));

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.load(firm.id, this.selectedYear());
      else { this.musteri.set([]); this.tedarikci.set([]); }
    });
  }

  async load(firmId: string, year: number): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.reportsService.getTopCariler(firmId, year, 10);
      this.musteri.set(result.musteri);
      this.tedarikci.set(result.tedarikci);
    } finally {
      this.loading.set(false);
    }
  }

  onYearChange(y: number): void {
    this.selectedYear.set(Number(y));
    const firm = this.activeFirm();
    if (firm) this.load(firm.id, Number(y));
  }

  pctOf(val: number, total: number): number {
    return total > 0 ? (val / total) * 100 : 0;
  }

  exportExcel(): void {
    const rows = [
      ...this.musteri().map(r => ({
        kategori: 'Müşteri',
        cari: r.cari_name,
        tutar: r.total_amount,
        islem_sayisi: r.transaction_count,
      })),
      ...this.tedarikci().map(r => ({
        kategori: 'Tedarikçi',
        cari: r.cari_name,
        tutar: r.total_amount,
        islem_sayisi: r.transaction_count,
      })),
    ];
    const blob = this.excel.exportTable(
      'Top Cariler',
      [
        { key: 'kategori', label: 'Kategori' },
        { key: 'cari', label: 'Cari' },
        { key: 'tutar', label: 'Yıllık Ciro' },
        { key: 'islem_sayisi', label: 'İşlem Sayısı' },
      ],
      rows,
    );
    this.excel.download(blob, `top_cariler_${this.selectedYear()}.xlsx`);
  }
}
