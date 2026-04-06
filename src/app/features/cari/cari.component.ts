import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CurrencyTryPipe } from '../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../shared/pipes/turkish-date.pipe';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import { CariService, CariAccountWithBalance, CariReportRow } from './cari.service';
import { CariAccount, CariType } from '../../core/models/cari-account.model';
import { Transaction } from '../../core/models/transaction.model';

type ActiveTab = 'list' | 'report';
type View = 'list' | 'form' | 'detail';

interface ReportGroup {
  year: number;
  months: {
    month: number;
    monthLabel: string;
    rows: CariReportRow[];
    subtotalGelir: number;
    subtotalGider: number;
    subtotalNet: number;
  }[];
  yearGelir: number;
  yearGider: number;
  yearNet: number;
}

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

@Component({
  selector: 'app-cari',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ConfirmDialogComponent,
    CurrencyTryPipe,
    TurkishDatePipe,
  ],
  templateUrl: './cari.component.html',
  styleUrl: './cari.component.scss',
})
export class CariComponent implements OnInit {
  private tenantService = inject(TenantService);
  private notificationService = inject(NotificationService);
  private cariService = inject(CariService);
  private fb = inject(FormBuilder);

  // Firm
  activeFirm = this.tenantService.activeFirm;

  // Tabs & views
  activeTab = signal<ActiveTab>('list');
  view = signal<View>('list');

  // Loading states
  loading = signal(false);
  loadingTransactions = signal(false);
  saving = signal(false);

  // List state
  cariAccounts = signal<CariAccountWithBalance[]>([]);
  filterType = signal<CariType | 'ALL'>('ALL');
  searchQuery = signal('');
  filteredAccounts = computed(() => {
    const accounts = this.cariAccounts();
    const type = this.filterType();
    const query = this.searchQuery().toLowerCase().trim();

    return accounts.filter(a => {
      const matchesType = type === 'ALL' || a.type === type;
      const matchesSearch = !query || a.name.toLowerCase().includes(query) ||
        (a.tax_no ?? '').toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  });

  // Summary KPIs
  totalGelir = computed(() => this.filteredAccounts().reduce((s, a) => s + (a.total_gelir ?? 0), 0));
  totalGider = computed(() => this.filteredAccounts().reduce((s, a) => s + (a.total_gider ?? 0), 0));
  totalNet = computed(() => this.filteredAccounts().reduce((s, a) => s + (a.net_balance ?? 0), 0));
  totalOverdue = computed(() => this.filteredAccounts().reduce((s, a) => s + (a.overdue_amount ?? 0), 0));

  // Detail state
  selectedAccount = signal<CariAccountWithBalance | null>(null);
  selectedCariDetail = signal<CariAccount | null>(null);
  transactions = signal<Transaction[]>([]);

  // Delete confirm
  showDeleteConfirm = signal(false);
  deleteTargetId = signal<string | null>(null);

  // Form state
  editingId = signal<string | null>(null);
  cariForm: FormGroup;

  // Report state
  reportLoading = signal(false);
  reportRows = signal<CariReportRow[]>([]);
  reportGroups = computed<ReportGroup[]>(() => this.buildReportGroups(this.reportRows()));
  reportTotalGelir = computed(() => this.reportRows().reduce((s, r) => s + r.gelir_total, 0));
  reportTotalGider = computed(() => this.reportRows().reduce((s, r) => s + r.gider_total, 0));
  reportTotalNet = computed(() => this.reportRows().reduce((s, r) => s + r.net, 0));

  reportFilterType = signal<CariType | 'ALL'>('ALL');
  reportDateFrom = signal('');
  reportDateTo = signal('');

  constructor() {
    this.cariForm = this.fb.group({
      type: ['MUSTERI', Validators.required],
      name: ['', [Validators.required, Validators.minLength(2)]],
      tax_no: [''],
      phone: [''],
      email: ['', Validators.email],
      address: [''],
      payment_term_days: [30, [Validators.required, Validators.min(0)]],
      is_active: [true],
    });

    effect(() => {
      const firm = this.activeFirm();
      if (firm) {
        this.loadCariAccounts(firm.id);
      } else {
        this.cariAccounts.set([]);
      }
    });
  }

  ngOnInit(): void {}

  // ----------------------------------------------------------------
  // Data Loading
  // ----------------------------------------------------------------

  async loadCariAccounts(firmId: string): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.cariService.getCariAccounts(firmId);
      this.cariAccounts.set(data);
    } catch (err) {
      console.error('Error loading cari accounts:', err);
      this.notificationService.error('Cari hesaplar yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadReport(): Promise<void> {
    const firm = this.activeFirm();
    if (!firm) return;

    this.reportLoading.set(true);
    try {
      const type = this.reportFilterType();
      const rows = await this.cariService.getCariReport(firm.id, {
        type: type !== 'ALL' ? type : undefined,
        dateFrom: this.reportDateFrom() || undefined,
        dateTo: this.reportDateTo() || undefined,
      });
      this.reportRows.set(rows);
    } catch (err) {
      console.error('Error loading cari report:', err);
      this.notificationService.error('Rapor yüklenirken hata oluştu.');
    } finally {
      this.reportLoading.set(false);
    }
  }

  // ----------------------------------------------------------------
  // Tab switching
  // ----------------------------------------------------------------

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'report' && this.reportRows().length === 0) {
      this.loadReport();
    }
  }

  // ----------------------------------------------------------------
  // CRUD
  // ----------------------------------------------------------------

  openCreate(): void {
    this.editingId.set(null);
    this.cariForm.reset({
      type: 'MUSTERI',
      name: '',
      tax_no: '',
      phone: '',
      email: '',
      address: '',
      payment_term_days: 30,
      is_active: true,
    });
    this.view.set('form');
  }

  openEdit(account: CariAccountWithBalance, event: Event): void {
    event.stopPropagation();
    this.editingId.set(account.id);
    this.cariForm.reset({
      type: account.type,
      name: account.name,
      tax_no: account.tax_no ?? '',
      phone: account.phone ?? '',
      email: (account as any).email ?? '',
      address: (account as any).address ?? '',
      payment_term_days: account.payment_term_days,
      is_active: true,
    });
    this.view.set('form');
  }

  async onFormSubmit(): Promise<void> {
    if (this.cariForm.invalid) {
      this.cariForm.markAllAsTouched();
      return;
    }

    const firm = this.activeFirm();
    if (!firm) return;

    this.saving.set(true);
    try {
      const formValue = this.cariForm.value;
      const id = this.editingId();

      if (id) {
        await this.cariService.updateCari(id, formValue);
        this.notificationService.success('Cari hesap güncellendi.');
      } else {
        await this.cariService.createCari({ ...formValue, firm_id: firm.id });
        this.notificationService.success('Cari hesap oluşturuldu.');
      }

      this.view.set('list');
      await this.loadCariAccounts(firm.id);
    } catch (err) {
      console.error('Error saving cari:', err);
      this.notificationService.error('Kayıt sırasında hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(id: string, event: Event): void {
    event.stopPropagation();
    this.deleteTargetId.set(id);
    this.showDeleteConfirm.set(true);
  }

  async onDeleteConfirmed(): Promise<void> {
    const id = this.deleteTargetId();
    if (!id) return;

    const firm = this.activeFirm();
    this.showDeleteConfirm.set(false);

    try {
      await this.cariService.deleteCari(id);
      this.notificationService.success('Cari hesap silindi.');
      if (firm) await this.loadCariAccounts(firm.id);
    } catch (err) {
      console.error('Error deleting cari:', err);
      this.notificationService.error('Silme işlemi sırasında hata oluştu.');
    }
  }

  onDeleteCancelled(): void {
    this.showDeleteConfirm.set(false);
    this.deleteTargetId.set(null);
  }

  // ----------------------------------------------------------------
  // Detail / Account Statement
  // ----------------------------------------------------------------

  async openDetail(account: CariAccountWithBalance): Promise<void> {
    this.selectedAccount.set(account);
    this.transactions.set([]);
    this.view.set('detail');
    this.loadingTransactions.set(true);

    try {
      const txns = await this.cariService.getCariTransactions(account.id);
      this.transactions.set(txns);
    } catch (err) {
      console.error('Error loading transactions:', err);
      this.notificationService.error('İşlemler yüklenirken hata oluştu.');
    } finally {
      this.loadingTransactions.set(false);
    }
  }

  openStatement(account: CariAccountWithBalance, event: Event): void {
    event.stopPropagation();
    this.openDetail(account);
  }

  backToList(): void {
    this.view.set('list');
    this.selectedAccount.set(null);
    this.transactions.set([]);
  }

  // ----------------------------------------------------------------
  // Filter helpers
  // ----------------------------------------------------------------

  onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  // ----------------------------------------------------------------
  // Report helpers
  // ----------------------------------------------------------------

  onReportFilterTypeChange(value: string): void {
    this.reportFilterType.set(value as CariType | 'ALL');
  }

  onReportDateFromChange(event: Event): void {
    this.reportDateFrom.set((event.target as HTMLInputElement).value);
  }

  onReportDateToChange(event: Event): void {
    this.reportDateTo.set((event.target as HTMLInputElement).value);
  }

  applyReportFilter(): void {
    this.loadReport();
  }

  private buildReportGroups(rows: CariReportRow[]): ReportGroup[] {
    const yearMap = new Map<number, ReportGroup>();

    for (const row of rows) {
      if (!yearMap.has(row.year)) {
        yearMap.set(row.year, {
          year: row.year,
          months: [],
          yearGelir: 0,
          yearGider: 0,
          yearNet: 0,
        });
      }

      const group = yearMap.get(row.year)!;
      let monthGroup = group.months.find(m => m.month === row.month);
      if (!monthGroup) {
        monthGroup = {
          month: row.month,
          monthLabel: TURKISH_MONTHS[row.month - 1],
          rows: [],
          subtotalGelir: 0,
          subtotalGider: 0,
          subtotalNet: 0,
        };
        group.months.push(monthGroup);
      }

      monthGroup.rows.push(row);
      monthGroup.subtotalGelir += row.gelir_total;
      monthGroup.subtotalGider += row.gider_total;
      monthGroup.subtotalNet += row.net;

      group.yearGelir += row.gelir_total;
      group.yearGider += row.gider_total;
      group.yearNet += row.net;
    }

    // Sort months descending within each year
    for (const group of yearMap.values()) {
      group.months.sort((a, b) => b.month - a.month);
    }

    return Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
  }

  // ----------------------------------------------------------------
  // Display helpers
  // ----------------------------------------------------------------

  getTypeLabel(type: CariType): string {
    return type === 'MUSTERI' ? 'Müşteri' : 'Tedarikçi';
  }

  getTypeClass(type: CariType): string {
    return type === 'MUSTERI' ? 'badge--musteri' : 'badge--tedarikci';
  }

  getNetClass(value: number): string {
    if (value > 0) return 'text-positive';
    if (value < 0) return 'text-negative';
    return '';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      BEKLIYOR: 'Bekliyor',
      ODENDI: 'Ödendi',
      IPTAL: 'İptal',
    };
    return map[status] ?? status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      BEKLIYOR: 'badge--warning',
      ODENDI: 'badge--success',
      IPTAL: 'badge--danger',
    };
    return map[status] ?? 'badge--neutral';
  }

  getTxnTypeLabel(type: string): string {
    return type === 'GELIR' ? 'Gelir' : 'Gider';
  }

  getTxnTypeClass(type: string): string {
    return type === 'GELIR' ? 'text-positive' : 'text-negative';
  }

  get isEditing(): boolean {
    return this.editingId() !== null;
  }

  hasFieldError(field: string): boolean {
    const ctrl = this.cariForm.get(field);
    return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched));
  }
}
