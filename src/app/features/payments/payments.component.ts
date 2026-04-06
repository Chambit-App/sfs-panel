import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CurrencyTryPipe } from '../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../shared/pipes/turkish-date.pipe';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import { PaymentsService, CategoryItem, DailyCashFlow } from './payments.service';
import { Transaction, TransactionType, TransactionStatus } from '../../core/models/transaction.model';
import { CariAccount } from '../../core/models/cari-account.model';
import { BankAccount } from '../../core/models/bank-account.model';

type TabId = 'list' | 'calendar' | 'form';

export interface CalendarDay {
  date: Date | null;
  dayNum: number | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  cashFlow: DailyCashFlow | null;
}

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ConfirmDialogComponent,
    CurrencyTryPipe,
    TurkishDatePipe,
  ],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss',
})
export class PaymentsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private tenantService = inject(TenantService);
  private notificationService = inject(NotificationService);
  private paymentsService = inject(PaymentsService);

  // ─── Tab State ───────────────────────────────────────────────────────────────
  activeTab = signal<TabId>('list');

  // ─── List Tab State ───────────────────────────────────────────────────────────
  transactions = signal<Transaction[]>([]);
  listLoading = signal(false);
  filterType = signal<TransactionType | 'ALL'>('ALL');
  filterStatus = signal<TransactionStatus | 'ALL'>('ALL');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  todayStr = new Date().toISOString().split('T')[0];

  filteredTransactions = computed(() => {
    let list = this.transactions();
    const type = this.filterType();
    const status = this.filterStatus();
    const from = this.filterDateFrom();
    const to = this.filterDateTo();

    if (type !== 'ALL') list = list.filter(t => t.type === type);
    if (status !== 'ALL') list = list.filter(t => t.status === status);
    if (from) list = list.filter(t => t.due_date >= from);
    if (to) list = list.filter(t => t.due_date <= to);

    return list;
  });

  // ─── Delete Confirm Dialog ────────────────────────────────────────────────────
  showDeleteDialog = signal(false);
  deleteTargetId = signal<string | null>(null);

  // ─── Edit Mode ────────────────────────────────────────────────────────────────
  editingId = signal<string | null>(null);

  // ─── Calendar Tab State ───────────────────────────────────────────────────────
  calendarMonth = signal(new Date().getMonth() + 1);
  calendarYear = signal(new Date().getFullYear());
  cashFlowData = signal<DailyCashFlow[]>([]);
  calendarLoading = signal(false);
  selectedDayTransactions = signal<Transaction[]>([]);
  selectedDayDate = signal<string | null>(null);

  calendarMonthLabel = computed(() => {
    return `${TURKISH_MONTHS[this.calendarMonth() - 1]} ${this.calendarYear()}`;
  });

  calendarDays = computed((): CalendarDay[] => {
    const month = this.calendarMonth();
    const year = this.calendarYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Monday-based week: 0=Mon...6=Sun
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon-based

    const days: CalendarDay[] = [];

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
      days.push({ date: null, dayNum: null, isCurrentMonth: false, isToday: false, isWeekend: false, cashFlow: null });
    }

    const cfData = this.cashFlowData();

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = date.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const isToday = date.getTime() === today.getTime();
      const cashFlow = cfData.find(cf => cf.due_date === dateStr) ?? null;

      days.push({ date, dayNum: d, isCurrentMonth: true, isToday, isWeekend, cashFlow });
    }

    return days;
  });

  // ─── Form Tab State ───────────────────────────────────────────────────────────
  formLoading = signal(false);
  cariAccounts = signal<CariAccount[]>([]);
  categoryItems = signal<CategoryItem[]>([]);
  bankAccounts = signal<BankAccount[]>([]);

  selectedTransactionType = signal<TransactionType>('GELIR');

  filteredCariAccounts = computed(() => {
    const type = this.selectedTransactionType();
    const caris = this.cariAccounts();
    if (type === 'GELIR') return caris.filter(c => c.type === 'MUSTERI');
    if (type === 'GIDER') return caris.filter(c => c.type === 'TEDARIKCI');
    return caris;
  });

  filteredCategoryItems = computed(() => {
    const type = this.selectedTransactionType();
    const cats = this.categoryItems();
    if (type === 'GELIR') return cats.filter(c => c.type === 'GELIR');
    if (type === 'GIDER') return cats.filter(c => c.type === 'GIDER');
    return cats;
  });

  transactionForm = this.fb.group({
    type: ['GELIR' as TransactionType, Validators.required],
    cari_id: ['', Validators.required],
    category_id: ['', Validators.required],
    bank_id: [''],
    invoice_no: [''],
    invoice_date: ['', Validators.required],
    payment_term_days: [30, [Validators.required, Validators.min(0)]],
    due_date: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: [''],
  });

  constructor() {
    // React to firm changes
    effect(() => {
      const firm = this.tenantService.activeFirm();
      if (firm) {
        this.loadTransactions();
        this.loadFormData();
        this.loadCashFlow();
      } else {
        this.transactions.set([]);
        this.cashFlowData.set([]);
      }
    });

    // Watch invoice_date and payment_term_days to auto-compute due_date
    this.transactionForm.get('invoice_date')!.valueChanges.subscribe(() => this.recalcDueDate());
    this.transactionForm.get('payment_term_days')!.valueChanges.subscribe(() => this.recalcDueDate());

    // Watch type to reset cari_id and category_id and update signal
    this.transactionForm.get('type')!.valueChanges.subscribe((val) => {
      this.selectedTransactionType.set(val as TransactionType);
      this.transactionForm.patchValue({ cari_id: '', category_id: '' }, { emitEvent: false });
    });
  }

  ngOnInit(): void {
    // Initial load handled by effect
  }

  // ─── Tab Navigation ───────────────────────────────────────────────────────────
  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    if (tab === 'calendar') {
      this.loadCashFlow();
    }
  }

  // ─── List Tab Methods ─────────────────────────────────────────────────────────
  async loadTransactions(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    this.listLoading.set(true);
    try {
      const data = await this.paymentsService.getTransactions(firm.id);
      this.transactions.set(data);
    } catch {
      this.notificationService.error('İşlemler yüklenirken hata oluştu.');
    } finally {
      this.listLoading.set(false);
    }
  }

  setFilterType(value: string): void {
    this.filterType.set(value as TransactionType | 'ALL');
  }

  setFilterStatus(value: string): void {
    this.filterStatus.set(value as TransactionStatus | 'ALL');
  }

  setFilterDateFrom(value: string): void {
    this.filterDateFrom.set(value);
  }

  setFilterDateTo(value: string): void {
    this.filterDateTo.set(value);
  }

  clearFilters(): void {
    this.filterType.set('ALL');
    this.filterStatus.set('ALL');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
  }

  isOverdue(t: Transaction): boolean {
    return t.status === 'BEKLIYOR' && t.due_date < this.todayStr;
  }

  getTypeLabel(type: TransactionType): string {
    return type === 'GELIR' ? 'Gelir' : 'Gider';
  }

  getStatusLabel(status: TransactionStatus): string {
    const map: Record<TransactionStatus, string> = {
      BEKLIYOR: 'Bekliyor',
      ODENDI: 'Ödendi',
      IPTAL: 'İptal',
    };
    return map[status] ?? status;
  }

  getStatusClass(status: TransactionStatus): string {
    const map: Record<TransactionStatus, string> = {
      BEKLIYOR: 'badge--warning',
      ODENDI: 'badge--success',
      IPTAL: 'badge--danger',
    };
    return map[status] ?? 'badge--neutral';
  }

  async markAsPaid(t: Transaction): Promise<void> {
    try {
      await this.paymentsService.updateStatus(t.id, 'ODENDI');
      this.notificationService.success('İşlem ödendi olarak işaretlendi.');
      await this.loadTransactions();
    } catch {
      this.notificationService.error('Durum güncellenirken hata oluştu.');
    }
  }

  editTransaction(t: Transaction): void {
    this.editingId.set(t.id);
    this.selectedTransactionType.set(t.type);
    this.transactionForm.patchValue({
      type: t.type,
      cari_id: t.cari_id,
      category_id: t.category_id,
      bank_id: t.bank_id ?? '',
      invoice_no: t.invoice_no ?? '',
      invoice_date: t.invoice_date,
      payment_term_days: t.payment_term_days,
      due_date: t.due_date,
      amount: t.amount,
      description: t.description ?? '',
    });
    this.setTab('form');
  }

  confirmDelete(id: string): void {
    this.deleteTargetId.set(id);
    this.showDeleteDialog.set(true);
  }

  cancelDelete(): void {
    this.showDeleteDialog.set(false);
    this.deleteTargetId.set(null);
  }

  async onDeleteConfirmed(): Promise<void> {
    const id = this.deleteTargetId();
    if (!id) return;

    try {
      await this.paymentsService.deleteTransaction(id);
      this.notificationService.success('İşlem silindi.');
      await this.loadTransactions();
    } catch {
      this.notificationService.error('İşlem silinirken hata oluştu.');
    } finally {
      this.showDeleteDialog.set(false);
      this.deleteTargetId.set(null);
    }
  }

  // ─── Calendar Tab Methods ─────────────────────────────────────────────────────
  async loadCashFlow(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    this.calendarLoading.set(true);
    try {
      const data = await this.paymentsService.getDailyCashFlow(
        firm.id,
        this.calendarMonth(),
        this.calendarYear(),
      );
      this.cashFlowData.set(data);
    } catch {
      this.notificationService.error('Nakit akış verisi yüklenirken hata oluştu.');
    } finally {
      this.calendarLoading.set(false);
    }
  }

  prevMonth(): void {
    let m = this.calendarMonth() - 1;
    let y = this.calendarYear();
    if (m < 1) { m = 12; y--; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
    this.selectedDayDate.set(null);
    this.selectedDayTransactions.set([]);
    this.loadCashFlow();
  }

  nextMonth(): void {
    let m = this.calendarMonth() + 1;
    let y = this.calendarYear();
    if (m > 12) { m = 1; y++; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
    this.selectedDayDate.set(null);
    this.selectedDayTransactions.set([]);
    this.loadCashFlow();
  }

  async onDayClick(day: CalendarDay): Promise<void> {
    if (!day.date || !day.isCurrentMonth) return;

    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    const dateStr = `${this.calendarYear()}-${String(this.calendarMonth()).padStart(2, '0')}-${String(day.dayNum).padStart(2, '0')}`;
    this.selectedDayDate.set(dateStr);

    try {
      const all = await this.paymentsService.getTransactions(firm.id, {
        dateFrom: dateStr,
        dateTo: dateStr,
      });
      this.selectedDayTransactions.set(all);
    } catch {
      this.selectedDayTransactions.set([]);
    }
  }

  closeDayDetail(): void {
    this.selectedDayDate.set(null);
    this.selectedDayTransactions.set([]);
  }

  getDayDateStr(day: CalendarDay): string {
    if (!day.dayNum) return '';
    const m = this.calendarMonth();
    const y = this.calendarYear();
    return `${y}-${String(m).padStart(2, '0')}-${String(day.dayNum).padStart(2, '0')}`;
  }

  isDaySelected(day: CalendarDay): boolean {
    if (!day.isCurrentMonth || !day.dayNum) return false;
    return this.selectedDayDate() === this.getDayDateStr(day);
  }

  // ─── Form Tab Methods ─────────────────────────────────────────────────────────
  async loadFormData(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    try {
      const [caris, cats, banks] = await Promise.all([
        this.paymentsService.getCariAccounts(firm.id),
        this.paymentsService.getCategoryItems(firm.id),
        this.paymentsService.getBankAccounts(firm.id),
      ]);
      this.cariAccounts.set(caris);
      this.categoryItems.set(cats);
      this.bankAccounts.set(banks);
    } catch {
      this.notificationService.error('Form verileri yüklenirken hata oluştu.');
    }
  }

  onCariChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const cari = this.cariAccounts().find(c => c.id === id);
    if (cari) {
      this.transactionForm.patchValue({ payment_term_days: cari.payment_term_days }, { emitEvent: true });
    }
  }

  private recalcDueDate(): void {
    const invoiceDate = this.transactionForm.get('invoice_date')?.value;
    const termDays = this.transactionForm.get('payment_term_days')?.value;

    if (invoiceDate && termDays != null) {
      const d = new Date(invoiceDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + Number(termDays));
        const dueStr = d.toISOString().split('T')[0];
        this.transactionForm.get('due_date')!.setValue(dueStr, { emitEvent: false });
      }
    }
  }

  resetForm(): void {
    this.editingId.set(null);
    this.selectedTransactionType.set('GELIR');
    this.transactionForm.reset({
      type: 'GELIR',
      cari_id: '',
      category_id: '',
      bank_id: '',
      invoice_no: '',
      invoice_date: '',
      payment_term_days: 30,
      due_date: '',
      amount: null,
      description: '',
    });
  }

  getControl(name: string): AbstractControl | null {
    return this.transactionForm.get(name);
  }

  isInvalid(name: string): boolean {
    const ctrl = this.transactionForm.get(name);
    return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched));
  }

  async onSubmit(): Promise<void> {
    if (this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }

    const firm = this.tenantService.activeFirm();
    if (!firm) {
      this.notificationService.error('Aktif firma seçili değil.');
      return;
    }

    this.formLoading.set(true);

    const raw = this.transactionForm.value;
    const payload: Partial<Transaction> = {
      firm_id: firm.id,
      type: raw.type as TransactionType,
      cari_id: raw.cari_id as string,
      category_id: raw.category_id as string,
      bank_id: raw.bank_id || null,
      invoice_no: raw.invoice_no || undefined,
      invoice_date: raw.invoice_date as string,
      payment_term_days: Number(raw.payment_term_days),
      due_date: raw.due_date as string,
      amount: Number(raw.amount),
      status: 'BEKLIYOR',
      description: raw.description || undefined,
    };

    try {
      const editId = this.editingId();
      if (editId) {
        await this.paymentsService.updateTransaction(editId, payload);
        this.notificationService.success('İşlem başarıyla güncellendi.');
      } else {
        await this.paymentsService.createTransaction(payload);
        this.notificationService.success('İşlem başarıyla kaydedildi.');
      }
      this.resetForm();
      await this.loadTransactions();
      this.setTab('list');
    } catch {
      this.notificationService.error('İşlem kaydedilirken hata oluştu.');
    } finally {
      this.formLoading.set(false);
    }
  }

  // ─── Categories Tab Methods ─────────────────────────────────────────────────
  catFilterType = signal<TransactionType | 'ALL'>('ALL');
  catEditingId = signal<string | null>(null);
  catSaving = signal(false);
  showCatDeleteDialog = signal(false);
  catDeleteTargetId = signal<string | null>(null);

  categoryForm = this.fb.group({
    type: ['GELIR' as TransactionType, Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    default_payment_term_days: [0, [Validators.required, Validators.min(0)]],
  });

  filteredCategoriesForList = computed(() => {
    const type = this.catFilterType();
    const cats = this.categoryItems();
    if (type === 'ALL') return cats;
    return cats.filter(c => c.type === type);
  });

  setCatFilterType(value: string): void {
    this.catFilterType.set(value as TransactionType | 'ALL');
  }

  openNewCategory(): void {
    this.catEditingId.set(null);
    this.categoryForm.reset({ type: 'GELIR', name: '', default_payment_term_days: 0 });
  }

  editCategory(cat: CategoryItem): void {
    this.catEditingId.set(cat.id);
    this.categoryForm.patchValue({
      type: cat.type,
      name: cat.name,
      default_payment_term_days: cat.default_payment_term_days,
    });
  }

  cancelCatEdit(): void {
    this.catEditingId.set(null);
    this.categoryForm.reset({ type: 'GELIR', name: '', default_payment_term_days: 0 });
  }

  async saveCategoryItem(): Promise<void> {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    this.catSaving.set(true);
    try {
      const val = this.categoryForm.value;
      const id = this.catEditingId();

      if (id) {
        await this.paymentsService.updateCategoryItem(id, val as Partial<CategoryItem>);
        this.notificationService.success('Kategori güncellendi.');
      } else {
        await this.paymentsService.createCategoryItem({ ...val, firm_id: firm.id } as Partial<CategoryItem>);
        this.notificationService.success('Kategori oluşturuldu.');
      }

      this.catEditingId.set(null);
      this.categoryForm.reset({ type: 'GELIR', name: '', default_payment_term_days: 0 });
      await this.loadFormData();
    } catch {
      this.notificationService.error('Kategori kaydedilirken hata oluştu.');
    } finally {
      this.catSaving.set(false);
    }
  }

  confirmCatDelete(id: string): void {
    this.catDeleteTargetId.set(id);
    this.showCatDeleteDialog.set(true);
  }

  cancelCatDelete(): void {
    this.showCatDeleteDialog.set(false);
    this.catDeleteTargetId.set(null);
  }

  async onCatDeleteConfirmed(): Promise<void> {
    const id = this.catDeleteTargetId();
    if (!id) return;

    try {
      await this.paymentsService.deleteCategoryItem(id);
      this.notificationService.success('Kategori silindi.');
      await this.loadFormData();
    } catch {
      this.notificationService.error('Kategori silinirken hata oluştu.');
    } finally {
      this.showCatDeleteDialog.set(false);
      this.catDeleteTargetId.set(null);
    }
  }
}
