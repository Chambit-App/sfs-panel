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
import { RouterLink } from '@angular/router';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import { ExcelService, BANK_SCHEMA } from '../../core/services/excel.service';
import { BankService, BankAccountWithBalance, BankTransferWithNames } from './bank.service';
import { BankAccount, BankTransfer } from '../../core/models/bank-account.model';
import { Transaction } from '../../core/models/transaction.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { DataTableComponent, TableColumn } from '../../shared/components/data-table/data-table.component';
import { CurrencyTryPipe } from '../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../shared/pipes/turkish-date.pipe';

type ActiveTab = 'accounts' | 'transfers';
type PanelMode = 'accountForm' | 'transferForm' | 'transactions' | null;

interface AccountFormData {
  bank_name: string;
  account_no: string;
  iban: string;
  currency: string;
  is_active: boolean;
}

interface TransferFormData {
  from_bank_id: string;
  to_bank_id: string;
  amount: number | null;
  date: string;
  description: string;
}

@Component({
  selector: 'app-bank',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    KpiCardComponent,
    ConfirmDialogComponent,
    DataTableComponent,
    CurrencyTryPipe,
    TurkishDatePipe,
  ],
  templateUrl: './bank.component.html',
  styleUrl: './bank.component.scss',
})
export class BankComponent implements OnInit {
  private tenantService = inject(TenantService);
  private bankService = inject(BankService);
  private notificationService = inject(NotificationService);
  private excelService = inject(ExcelService);

  // State
  activeTab = signal<ActiveTab>('accounts');
  loading = signal(false);
  panelMode = signal<PanelMode>(null);
  saving = signal(false);

  // Data
  accounts = signal<BankAccountWithBalance[]>([]);
  transfers = signal<BankTransferWithNames[]>([]);
  selectedAccountTransactions = signal<Transaction[]>([]);
  selectedAccount = signal<BankAccountWithBalance | null>(null);

  // Edit tracking
  editingAccountId = signal<string | null>(null);
  deletingAccountId = signal<string | null>(null);
  deletingTransferId = signal<string | null>(null);

  // Filters
  transferDateFrom = signal('');
  transferDateTo = signal('');

  // KPIs
  totalBalance = computed(() =>
    this.accounts().reduce((sum, a) => sum + (a.balance ?? 0), 0)
  );
  activeAccountCount = computed(() =>
    this.accounts().filter(a => a.is_active).length
  );

  // Forms
  accountForm = signal<AccountFormData>({
    bank_name: '',
    account_no: '',
    iban: '',
    currency: 'TRY',
    is_active: true,
  });

  transferForm = signal<TransferFormData>({
    from_bank_id: '',
    to_bank_id: '',
    amount: null,
    date: new Date().toISOString().slice(0, 10),
    description: '',
  });

  // Filtered "to" accounts for transfer (exclude from_bank)
  toAccountOptions = computed(() =>
    this.accounts().filter(
      a => a.is_active && a.id !== this.transferForm().from_bank_id
    )
  );

  fromAccountOptions = computed(() =>
    this.accounts().filter(a => a.is_active)
  );

  // Transfer table columns
  transferColumns: TableColumn[] = [
    { field: 'date', header: 'Tarih', type: 'date' },
    { field: 'from_bank_name', header: 'Nereden', type: 'text' },
    { field: 'to_bank_name', header: 'Nereye', type: 'text' },
    { field: 'amount', header: 'Tutar', type: 'currency' },
    { field: 'description', header: 'Açıklama', type: 'text' },
  ];

  // Transaction table columns
  transactionColumns: TableColumn[] = [
    { field: 'due_date', header: 'Tarih', type: 'date' },
    { field: 'cari_name', header: 'Cari', type: 'text' },
    { field: 'category_name', header: 'Kategori', type: 'text' },
    { field: 'type', header: 'Tür', type: 'text' },
    { field: 'amount', header: 'Tutar', type: 'currency' },
    { field: 'status', header: 'Durum', type: 'status' },
  ];

  // IBAN validation error
  ibanError = signal('');

  constructor() {
    // React to firm changes
    effect(() => {
      const firm = this.tenantService.activeFirm();
      if (firm) {
        this.loadAccounts();
        if (this.activeTab() === 'transfers') {
          this.loadTransfers();
        }
      } else {
        this.accounts.set([]);
        this.transfers.set([]);
      }
    });
  }

  ngOnInit(): void {
    // initial load handled by effect
  }

  // ─── Tab switching ──────────────────────────────────────────
  switchTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.closePanel();
    if (tab === 'transfers') {
      this.loadTransfers();
    }
  }

  // ─── Data loading ───────────────────────────────────────────
  async loadAccounts(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) return;
    this.loading.set(true);
    try {
      const data = await this.bankService.getBankAccounts(firm.id);
      this.accounts.set(data);
    } catch {
      this.notificationService.error('Banka hesapları yüklenemedi.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadTransfers(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) return;
    this.loading.set(true);
    try {
      const filters = {
        dateFrom: this.transferDateFrom() || undefined,
        dateTo: this.transferDateTo() || undefined,
      };
      const data = await this.bankService.getTransfers(firm.id, filters);
      this.transfers.set(data);
    } catch {
      this.notificationService.error('Transferler yüklenemedi.');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Panel management ────────────────────────────────────────
  openAddAccount(): void {
    this.editingAccountId.set(null);
    this.accountForm.set({
      bank_name: '',
      account_no: '',
      iban: '',
      currency: 'TRY',
      is_active: true,
    });
    this.ibanError.set('');
    this.panelMode.set('accountForm');
  }

  exportAccounts(): void {
    const rows = this.accounts().map(a => ({
      id: a.id,
      bank_name: a.bank_name,
      account_no: a.account_no,
      iban: a.iban ?? '',
      currency: a.currency,
    }));
    const schemaWithId = {
      ...BANK_SCHEMA,
      columns: [
        { key: 'id', label: 'UUID', type: 'uuid' as const, required: false, description: 'Sistem ID — import için kopyalanabilir' },
        ...BANK_SCHEMA.columns,
      ],
    };
    const blob = this.excelService.exportRows(schemaWithId, rows);
    const today = new Date().toISOString().split('T')[0];
    this.excelService.download(blob, `banka_hesaplari_${today}.xlsx`);
  }

  openEditAccount(account: BankAccountWithBalance): void {
    this.editingAccountId.set(account.id);
    this.accountForm.set({
      bank_name: account.bank_name,
      account_no: account.account_no,
      iban: account.iban ?? '',
      currency: account.currency,
      is_active: account.is_active,
    });
    this.ibanError.set('');
    this.panelMode.set('accountForm');
  }

  openAddTransfer(): void {
    this.transferForm.set({
      from_bank_id: '',
      to_bank_id: '',
      amount: null,
      date: new Date().toISOString().slice(0, 10),
      description: '',
    });
    this.panelMode.set('transferForm');
  }

  async openTransactions(account: BankAccountWithBalance): Promise<void> {
    this.selectedAccount.set(account);
    this.panelMode.set('transactions');
    this.loading.set(true);
    try {
      const txns = await this.bankService.getBankTransactions(account.id);
      this.selectedAccountTransactions.set(txns);
    } catch {
      this.notificationService.error('İşlemler yüklenemedi.');
    } finally {
      this.loading.set(false);
    }
  }

  closePanel(): void {
    this.panelMode.set(null);
    this.editingAccountId.set(null);
    this.selectedAccount.set(null);
    this.selectedAccountTransactions.set([]);
  }

  // ─── IBAN validation ─────────────────────────────────────────
  validateIban(value: string): void {
    if (!value) {
      this.ibanError.set('');
      return;
    }
    const ibanRegex = /^TR\d{24}$/;
    if (!ibanRegex.test(value.replace(/\s/g, '').toUpperCase())) {
      this.ibanError.set("IBAN formatı geçersiz. TR ile başlayan 26 karakter olmalı (TR + 24 rakam).");
    } else {
      this.ibanError.set('');
    }
  }

  updateAccountForm(field: keyof AccountFormData, value: string | boolean): void {
    this.accountForm.update(f => ({ ...f, [field]: value }));
    if (field === 'iban') {
      this.validateIban(value as string);
    }
  }

  updateTransferForm(field: keyof TransferFormData, value: string | number | null): void {
    this.transferForm.update(f => ({ ...f, [field]: value }));
    // Clear to_bank if same as from_bank
    if (field === 'from_bank_id' && value === this.transferForm().to_bank_id) {
      this.transferForm.update(f => ({ ...f, to_bank_id: '' }));
    }
  }

  // ─── Account CRUD ────────────────────────────────────────────
  async saveAccount(): Promise<void> {
    const form = this.accountForm();
    if (!form.bank_name.trim() || !form.account_no.trim()) {
      this.notificationService.error('Banka adı ve hesap numarası zorunludur.');
      return;
    }
    if (this.ibanError()) {
      this.notificationService.error('IBAN formatı geçersiz.');
      return;
    }

    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    this.saving.set(true);
    try {
      const payload: Partial<BankAccount> = {
        bank_name: form.bank_name.trim(),
        account_no: form.account_no.trim(),
        iban: form.iban.trim() || undefined,
        currency: form.currency,
        is_active: form.is_active,
        firm_id: firm.id,
      };

      const editId = this.editingAccountId();
      if (editId) {
        await this.bankService.updateBankAccount(editId, payload);
        this.notificationService.success('Banka hesabı güncellendi.');
      } else {
        await this.bankService.createBankAccount(payload);
        this.notificationService.success('Banka hesabı oluşturuldu.');
      }
      this.closePanel();
      await this.loadAccounts();
    } catch {
      this.notificationService.error('Kayıt sırasında hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteAccount(id: string): void {
    this.deletingAccountId.set(id);
  }

  async deleteAccount(): Promise<void> {
    const id = this.deletingAccountId();
    if (!id) return;
    try {
      await this.bankService.deleteBankAccount(id);
      this.notificationService.success('Banka hesabı silindi.');
      await this.loadAccounts();
    } catch {
      this.notificationService.error('Silme işlemi başarısız.');
    } finally {
      this.deletingAccountId.set(null);
    }
  }

  // ─── Transfer CRUD ───────────────────────────────────────────
  async saveTransfer(): Promise<void> {
    const form = this.transferForm();
    if (!form.from_bank_id || !form.to_bank_id) {
      this.notificationService.error('Kaynak ve hedef hesap seçilmelidir.');
      return;
    }
    if (!form.amount || form.amount <= 0) {
      this.notificationService.error('Geçerli bir tutar giriniz.');
      return;
    }
    if (!form.date) {
      this.notificationService.error('Tarih seçilmelidir.');
      return;
    }

    const firm = this.tenantService.activeFirm();
    if (!firm) return;

    this.saving.set(true);
    try {
      const payload: Partial<BankTransfer> = {
        firm_id: firm.id,
        from_bank_id: form.from_bank_id,
        to_bank_id: form.to_bank_id,
        amount: form.amount,
        date: form.date,
        description: form.description.trim() || undefined,
      };
      await this.bankService.createTransfer(payload);
      this.notificationService.success('Transfer kaydedildi.');
      this.closePanel();
      await this.loadTransfers();
      await this.loadAccounts();
    } catch {
      this.notificationService.error('Transfer kaydı sırasında hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteTransfer(id: string): void {
    this.deletingTransferId.set(id);
  }

  async deleteTransfer(): Promise<void> {
    const id = this.deletingTransferId();
    if (!id) return;
    try {
      await this.bankService.deleteTransfer(id);
      this.notificationService.success('Transfer silindi.');
      await this.loadTransfers();
      await this.loadAccounts();
    } catch {
      this.notificationService.error('Silme işlemi başarısız.');
    } finally {
      this.deletingTransferId.set(null);
    }
  }

  async applyTransferFilters(): Promise<void> {
    await this.loadTransfers();
  }

  clearTransferFilters(): void {
    this.transferDateFrom.set('');
    this.transferDateTo.set('');
    this.loadTransfers();
  }

  // ─── Helpers ────────────────────────────────────────────────
  getTransferById(id: string): BankTransferWithNames | undefined {
    return this.transfers().find(t => t.id === id);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  get hasFirm(): boolean {
    return !!this.tenantService.activeFirm();
  }
}
