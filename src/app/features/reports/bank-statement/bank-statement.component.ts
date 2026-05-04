import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../../shared/pipes/turkish-date.pipe';
import { TenantService } from '../../../core/services/tenant.service';
import { ReportsService, BankStatementEntry } from '../reports.service';
import { ExcelService } from '../../../core/services/excel.service';
import { SupabaseService } from '../../../core/services/supabase.service';

interface BankOption {
  id: string;
  bank_name: string;
}

@Component({
  selector: 'app-bank-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, TurkishDatePipe],
  templateUrl: './bank-statement.component.html',
  styleUrl: './bank-statement.component.scss',
})
export class BankStatementComponent {
  private tenantService = inject(TenantService);
  private reportsService = inject(ReportsService);
  private excel = inject(ExcelService);
  private supabase = inject(SupabaseService);

  activeFirm = this.tenantService.activeFirm;
  loading = signal(false);

  banks = signal<BankOption[]>([]);
  selectedBankId = signal<string>('');
  fromDate = signal<string>(this.firstOfMonth());
  toDate = signal<string>(this.todayIso());
  entries = signal<BankStatementEntry[]>([]);

  selectedBankName = computed(
    () => this.banks().find(b => b.id === this.selectedBankId())?.bank_name ?? '',
  );

  totalsIn = computed(() =>
    this.entries().filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
  );
  totalsOut = computed(() =>
    this.entries().filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0),
  );
  netChange = computed(() => this.totalsIn() - this.totalsOut());
  closingBalance = computed(() => {
    const e = this.entries();
    return e.length > 0 ? e[e.length - 1].running_balance : 0;
  });
  openingBalance = computed(() => this.closingBalance() - this.netChange());

  private firstOfMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  private todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  constructor() {
    effect(() => {
      const firm = this.activeFirm();
      if (firm) this.loadBanks(firm.id);
      else { this.banks.set([]); this.entries.set([]); }
    });
  }

  async loadBanks(firmId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('bank_accounts')
      .select('id, bank_name')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .order('bank_name');
    const banks = (data ?? []) as BankOption[];
    this.banks.set(banks);
    if (banks.length > 0 && !this.selectedBankId()) {
      this.selectedBankId.set(banks[0].id);
      this.loadEntries();
    }
  }

  async loadEntries(): Promise<void> {
    const firm = this.activeFirm();
    const bankId = this.selectedBankId();
    if (!firm || !bankId) return;

    this.loading.set(true);
    try {
      this.entries.set(
        await this.reportsService.getBankStatement(firm.id, bankId, this.fromDate(), this.toDate()),
      );
    } finally {
      this.loading.set(false);
    }
  }

  onBankChange(id: string): void {
    this.selectedBankId.set(id);
    this.loadEntries();
  }

  onFromChange(d: string): void {
    this.fromDate.set(d);
    this.loadEntries();
  }

  onToChange(d: string): void {
    this.toDate.set(d);
    this.loadEntries();
  }

  kindLabel(kind: BankStatementEntry['kind']): string {
    return {
      GELIR: 'Tahsilat',
      GIDER: 'Ödeme',
      TRANSFER_IN: 'Transfer (Gelen)',
      TRANSFER_OUT: 'Transfer (Giden)',
    }[kind];
  }

  kindClass(kind: BankStatementEntry['kind']): string {
    if (kind === 'GELIR' || kind === 'TRANSFER_IN') return 'kind kind--in';
    return 'kind kind--out';
  }

  exportExcel(): void {
    const data = this.entries().map(e => ({
      tarih: e.date,
      islem: this.kindLabel(e.kind),
      cari: e.cari_name,
      fatura_no: e.invoice_no,
      aciklama: e.description,
      giren: e.amount > 0 ? e.amount : '',
      cikan: e.amount < 0 ? Math.abs(e.amount) : '',
      bakiye: e.running_balance,
    }));
    const blob = this.excel.exportTable(
      `${this.selectedBankName()} Ekstresi`.slice(0, 31), // Excel sheet name max 31 chars
      [
        { key: 'tarih', label: 'Tarih' },
        { key: 'islem', label: 'İşlem' },
        { key: 'cari', label: 'Cari / Karşı Banka' },
        { key: 'fatura_no', label: 'Fatura No' },
        { key: 'aciklama', label: 'Açıklama' },
        { key: 'giren', label: 'Giren' },
        { key: 'cikan', label: 'Çıkan' },
        { key: 'bakiye', label: 'Bakiye' },
      ],
      data,
    );
    this.excel.download(blob, `banka_ekstresi_${this.fromDate()}_${this.toDate()}.xlsx`);
  }
}
