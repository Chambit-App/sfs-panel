import {
  Component,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SettingsService, CategoryItem } from './settings.service';
import { ChartOfAccounts } from '../../core/models/chart-of-accounts.model';
import { Firm } from '../../core/models/firm.model';
import { AppUser, UserRole } from '../../core/models/user.model';
import { Tenant } from '../../core/models/tenant.model';

type TabId = 'tenants' | 'categories' | 'chart' | 'firms' | 'users';
type TypeFilter = 'ALL' | 'GELIR' | 'GIDER';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private fb = inject(FormBuilder);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private settingsService = inject(SettingsService);

  // ─── Auth ─────────────────────────────────────────────────────────────────────
  isSuperAdmin = this.authService.isSuperAdmin;

  // ─── Tab State ────────────────────────────────────────────────────────────────
  activeTab = signal<TabId>('categories');

  // ─── Loading ──────────────────────────────────────────────────────────────────
  loading = signal(false);
  saving = signal(false);

  // ─── Delete Dialog State ──────────────────────────────────────────────────────
  showDeleteDialog = signal(false);
  deleteTargetId = signal<string | null>(null);
  deleteContext = signal<'category' | 'chart' | 'firm' | 'tenant'>('category');

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 1: CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────────

  categories = signal<CategoryItem[]>([]);
  catFilterType = signal<TypeFilter>('ALL');
  catEditingId = signal<string | null>(null);

  filteredCategories = computed(() => {
    const filter = this.catFilterType();
    const cats = this.categories();
    return filter === 'ALL' ? cats : cats.filter(c => c.type === filter);
  });

  categoryForm = this.fb.group({
    type: ['GELIR' as 'GELIR' | 'GIDER', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    default_payment_term_days: [0, [Validators.required, Validators.min(0)]],
    is_active: [true],
  });

  async loadCategories(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) { this.categories.set([]); return; }
    this.loading.set(true);
    try {
      this.categories.set(await this.settingsService.getCategoryItems(firm.id));
    } catch {
      this.notificationService.error('Kategoriler yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  editCategory(cat: CategoryItem): void {
    this.catEditingId.set(cat.id);
    this.categoryForm.patchValue({
      type: cat.type,
      name: cat.name,
      default_payment_term_days: cat.default_payment_term_days,
      is_active: cat.is_active,
    });
  }

  cancelCatEdit(): void {
    this.catEditingId.set(null);
    this.categoryForm.reset({ type: 'GELIR', name: '', default_payment_term_days: 0, is_active: true });
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid) { this.categoryForm.markAllAsTouched(); return; }
    const firm = this.tenantService.activeFirm();
    if (!firm) { this.notificationService.error('Aktif firma seçili değil.'); return; }
    this.saving.set(true);
    try {
      const val = this.categoryForm.value;
      const id = this.catEditingId();
      if (id) {
        await this.settingsService.updateCategoryItem(id, val as Partial<CategoryItem>);
        this.notificationService.success('Kategori güncellendi.');
      } else {
        await this.settingsService.createCategoryItem({ ...val, firm_id: firm.id } as Partial<CategoryItem>);
        this.notificationService.success('Kategori eklendi.');
      }
      this.catEditingId.set(null);
      this.categoryForm.reset({ type: 'GELIR', name: '', default_payment_term_days: 0, is_active: true });
      await this.loadCategories();
    } catch {
      this.notificationService.error('Kategori kaydedilirken hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleCategoryActive(cat: CategoryItem): Promise<void> {
    try {
      await this.settingsService.toggleCategoryItemActive(cat.id, !cat.is_active);
      this.notificationService.success(`Kategori ${!cat.is_active ? 'aktif' : 'pasif'} yapıldı.`);
      await this.loadCategories();
    } catch {
      this.notificationService.error('Durum güncellenirken hata oluştu.');
    }
  }

  confirmDeleteCategory(id: string): void {
    this.deleteTargetId.set(id);
    this.deleteContext.set('category');
    this.showDeleteDialog.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 2: CHART OF ACCOUNTS
  // ─────────────────────────────────────────────────────────────────────────────

  chartAccounts = signal<ChartOfAccounts[]>([]);
  chartFilterType = signal<TypeFilter>('ALL');
  chartEditingId = signal<string | null>(null);
  chartSortAsc = signal(true);

  filteredChartAccounts = computed(() => {
    const filter = this.chartFilterType();
    let accounts = this.chartAccounts();
    if (filter !== 'ALL') accounts = accounts.filter(a => a.type === filter);
    return this.chartSortAsc()
      ? [...accounts].sort((a, b) => a.code.localeCompare(b.code))
      : [...accounts].sort((a, b) => b.code.localeCompare(a.code));
  });

  parentCodeOptions = computed(() =>
    this.chartAccounts()
      .filter(a => !a.parent_code)
      .sort((a, b) => a.code.localeCompare(b.code))
  );

  chartForm = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(1)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['GELIR' as 'GELIR' | 'GIDER', Validators.required],
    parent_code: [null as string | null],
    is_active: [true],
  });

  async loadChartAccounts(): Promise<void> {
    const firm = this.tenantService.activeFirm();
    if (!firm) { this.chartAccounts.set([]); return; }
    this.loading.set(true);
    try {
      this.chartAccounts.set(await this.settingsService.getChartOfAccounts(firm.id));
    } catch {
      this.notificationService.error('Hesap planı yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  editChartAccount(acc: ChartOfAccounts): void {
    this.chartEditingId.set(acc.id);
    this.chartForm.patchValue({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      parent_code: acc.parent_code,
      is_active: acc.is_active,
    });
  }

  cancelChartEdit(): void {
    this.chartEditingId.set(null);
    this.chartForm.reset({ code: '', name: '', type: 'GELIR', parent_code: null, is_active: true });
  }

  async saveChartAccount(): Promise<void> {
    if (this.chartForm.invalid) { this.chartForm.markAllAsTouched(); return; }
    const firm = this.tenantService.activeFirm();
    if (!firm) { this.notificationService.error('Aktif firma seçili değil.'); return; }
    this.saving.set(true);
    try {
      const val = this.chartForm.value;
      const id = this.chartEditingId();
      const payload: Partial<ChartOfAccounts> = {
        code: val.code as string,
        name: val.name as string,
        type: val.type as 'GELIR' | 'GIDER',
        parent_code: val.parent_code || null,
        is_active: val.is_active as boolean,
      };
      if (id) {
        await this.settingsService.updateChartOfAccount(id, payload);
        this.notificationService.success('Hesap güncellendi.');
      } else {
        await this.settingsService.createChartOfAccount({ ...payload, firm_id: firm.id });
        this.notificationService.success('Hesap eklendi.');
      }
      this.chartEditingId.set(null);
      this.chartForm.reset({ code: '', name: '', type: 'GELIR', parent_code: null, is_active: true });
      await this.loadChartAccounts();
    } catch {
      this.notificationService.error('Hesap kaydedilirken hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleChartActive(acc: ChartOfAccounts): Promise<void> {
    try {
      await this.settingsService.toggleChartOfAccountActive(acc.id, !acc.is_active);
      this.notificationService.success(`Hesap ${!acc.is_active ? 'aktif' : 'pasif'} yapıldı.`);
      await this.loadChartAccounts();
    } catch {
      this.notificationService.error('Durum güncellenirken hata oluştu.');
    }
  }

  confirmDeleteChart(id: string): void {
    this.deleteTargetId.set(id);
    this.deleteContext.set('chart');
    this.showDeleteDialog.set(true);
  }

  isChildAccount(acc: ChartOfAccounts): boolean {
    return !!acc.parent_code;
  }

  toggleChartSort(): void {
    this.chartSortAsc.update(v => !v);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 3: FIRM MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  firms = signal<(Firm & { tenant_name?: string })[]>([]);
  firmEditingId = signal<string | null>(null);
  showFirmForm = signal(false);

  firmForm = this.fb.group({
    tenant_id: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    tax_no: ['', Validators.required],
    address: [''],
    phone: [''],
  });

  async loadFirms(): Promise<void> {
    this.loading.set(true);
    try {
      // Load all firms across all tenants for super admin view
      const allTenants = this.tenants().length > 0 ? this.tenants() : await this.settingsService.getTenants();
      const allFirms: (Firm & { tenant_name?: string })[] = [];
      for (const t of allTenants) {
        const firms = await this.settingsService.getFirms(t.id);
        for (const f of firms) {
          allFirms.push({ ...f, tenant_name: t.name });
        }
      }
      this.firms.set(allFirms);
    } catch {
      this.notificationService.error('Firmalar yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  openNewFirm(): void {
    this.firmEditingId.set(null);
    const activeTenantId = this.tenantService.activeTenant()?.id ?? '';
    this.firmForm.reset({ tenant_id: activeTenantId, name: '', tax_no: '', address: '', phone: '' });
    this.showFirmForm.set(true);
  }

  editFirm(firm: Firm): void {
    this.firmEditingId.set(firm.id);
    this.firmForm.patchValue({
      tenant_id: firm.tenant_id,
      name: firm.name,
      tax_no: firm.tax_no,
      address: firm.address ?? '',
      phone: firm.phone ?? '',
    });
    this.showFirmForm.set(true);
  }

  cancelFirmEdit(): void {
    this.firmEditingId.set(null);
    this.showFirmForm.set(false);
    this.firmForm.reset();
  }

  async saveFirm(): Promise<void> {
    if (this.firmForm.invalid) { this.firmForm.markAllAsTouched(); return; }
    this.saving.set(true);
    try {
      const val = this.firmForm.value;
      const id = this.firmEditingId();
      if (id) {
        await this.settingsService.updateFirm(id, {
          name: val.name!, tax_no: val.tax_no!, address: val.address!, phone: val.phone!,
        } as Partial<Firm>);
        this.notificationService.success('Firma güncellendi.');
      } else {
        await this.settingsService.createFirm({
          tenant_id: val.tenant_id!,
          name: val.name!,
          tax_no: val.tax_no!,
          address: val.address!,
          phone: val.phone!,
        } as Partial<Firm>);
        this.notificationService.success('Firma eklendi.');
      }
      this.firmEditingId.set(null);
      this.showFirmForm.set(false);
      this.firmForm.reset();
      await this.loadFirms();
      // Refresh tenant service firms list
      await this.tenantService.loadFirms();
    } catch {
      this.notificationService.error('Firma kaydedilirken hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleFirmActive(firm: Firm & { is_active?: boolean }): Promise<void> {
    try {
      await this.settingsService.toggleFirmActive(firm.id, !firm.is_active);
      this.notificationService.success(`Firma ${!firm.is_active ? 'aktif' : 'pasif'} yapıldı.`);
      await this.loadFirms();
    } catch {
      this.notificationService.error('Durum güncellenirken hata oluştu.');
    }
  }

  confirmDeleteFirm(id: string): void {
    this.deleteTargetId.set(id);
    this.deleteContext.set('firm');
    this.showDeleteDialog.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 4: USER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  users = signal<AppUser[]>([]);
  userSavingId = signal<string | null>(null);
  showUserForm = signal(false);
  showUserDeleteDialog = signal(false);
  userDeleteTargetId = signal<string | null>(null);

  // Edit dialog state
  showUserEditDialog = signal(false);
  userEditTarget = signal<AppUser | null>(null);
  editPasswordValue = signal<string>('');
  editPasswordSaving = signal(false);

  readonly roleLabels: Record<UserRole, string> = {
    super_admin: 'Süper Admin',
    tenant_admin: 'Grup Yöneticisi',
    firm_manager: 'Firma Yöneticisi',
    accountant: 'Muhasebeci',
    viewer: 'Görüntüleyici',
  };

  readonly roleOptions: UserRole[] = ['tenant_admin', 'firm_manager', 'accountant', 'viewer'];

  userForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    tenant_id: ['', Validators.required],
    firm_id: [''],
    role: ['viewer' as UserRole, Validators.required],
  });

  editUserForm = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    tenant_id: ['', Validators.required],
    firm_id: [''],
    role: ['viewer' as UserRole, Validators.required],
    is_active: [true],
    is_super_admin: [false],
  });

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.settingsService.getAllUsers());
    } catch {
      this.notificationService.error('Kullanıcılar yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  /** True if the user being edited is the only remaining super admin. */
  isLastSuperAdmin(target: AppUser | null): boolean {
    if (!target?.is_super_admin) return false;
    return this.users().filter(u => u.is_super_admin).length === 1;
  }

  getTenantName(tenantId: string | null): string {
    if (!tenantId) return '—';
    const t = this.tenants().find(x => x.id === tenantId);
    return t?.name ?? '—';
  }

  async onRoleChange(user: AppUser, event: Event): Promise<void> {
    const role = (event.target as HTMLSelectElement).value as UserRole;
    this.userSavingId.set(user.id);
    try {
      await this.settingsService.updateUserRole(user.id, role);
      this.notificationService.success('Kullanıcı rolü güncellendi.');
      await this.loadUsers();
    } catch {
      this.notificationService.error('Rol güncellenirken hata oluştu.');
    } finally {
      this.userSavingId.set(null);
    }
  }

  async toggleUserActive(user: AppUser): Promise<void> {
    this.userSavingId.set(user.id);
    try {
      await this.settingsService.toggleUserActive(user.id, !user.is_active);
      this.notificationService.success(`Kullanıcı ${!user.is_active ? 'aktif' : 'pasif'} yapıldı.`);
      await this.loadUsers();
    } catch {
      this.notificationService.error('Durum güncellenirken hata oluştu.');
    } finally {
      this.userSavingId.set(null);
    }
  }

  getFirmName(firmId: string | null): string {
    if (!firmId) return 'Tüm Firmalar';
    const firm = this.firms().find(f => f.id === firmId);
    return firm?.name ?? '—';
  }

  // Firms for the selected tenant in user form
  get userFormFirms(): Firm[] {
    const tenantId = this.userForm.get('tenant_id')?.value;
    if (!tenantId) return [];
    return this.firms().filter(f => (f as any).tenant_id === tenantId);
  }

  // Firms for the selected tenant in edit form
  get editUserFormFirms(): Firm[] {
    const tenantId = this.editUserForm.get('tenant_id')?.value;
    if (!tenantId) return [];
    return this.firms().filter(f => (f as any).tenant_id === tenantId);
  }

  openEditUser(user: AppUser): void {
    this.userEditTarget.set(user);
    this.editUserForm.reset({
      full_name: user.full_name,
      tenant_id: user.tenant_id ?? '',
      firm_id: user.firm_id ?? '',
      role: user.role,
      is_active: user.is_active,
      is_super_admin: user.is_super_admin,
    });
    this.editPasswordValue.set('');
    this.showUserEditDialog.set(true);
  }

  cancelEditUser(): void {
    this.showUserEditDialog.set(false);
    this.userEditTarget.set(null);
    this.editUserForm.reset();
    this.editPasswordValue.set('');
  }

  async saveEditUser(): Promise<void> {
    const target = this.userEditTarget();
    if (!target) return;
    if (this.editUserForm.invalid) {
      this.editUserForm.markAllAsTouched();
      return;
    }
    const val = this.editUserForm.value;

    // Last super admin guard (client-side; server also enforces)
    if (target.is_super_admin && val.is_super_admin === false && this.isLastSuperAdmin(target)) {
      this.notificationService.error('Son süper admin yetkisi kaldırılamaz.');
      return;
    }

    this.userSavingId.set(target.id);
    try {
      await this.settingsService.updateUser({
        user_id: target.id,
        profile: {
          full_name: val.full_name ?? undefined,
          tenant_id: val.tenant_id || null,
          firm_id: val.firm_id || null,
          role: val.role as UserRole,
          is_active: val.is_active ?? undefined,
          is_super_admin: val.is_super_admin ?? undefined,
        },
      });
      this.notificationService.success('Kullanıcı bilgileri güncellendi.');
      this.showUserEditDialog.set(false);
      this.userEditTarget.set(null);
      await this.loadUsers();
    } catch (e: any) {
      this.notificationService.error(e?.message || 'Kullanıcı güncellenirken hata oluştu.');
    } finally {
      this.userSavingId.set(null);
    }
  }

  async resetPassword(): Promise<void> {
    const target = this.userEditTarget();
    if (!target) return;
    const newPassword = this.editPasswordValue().trim();
    if (newPassword.length < 6) {
      this.notificationService.error('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    this.editPasswordSaving.set(true);
    try {
      await this.settingsService.updateUser({
        user_id: target.id,
        password: newPassword,
      });
      this.notificationService.success(`${target.full_name} için şifre güncellendi.`);
      this.editPasswordValue.set('');
    } catch (e: any) {
      this.notificationService.error(e?.message || 'Şifre güncellenemedi.');
    } finally {
      this.editPasswordSaving.set(false);
    }
  }

  onEditPasswordChange(event: Event): void {
    this.editPasswordValue.set((event.target as HTMLInputElement).value);
  }

  openNewUser(): void {
    const activeTenantId = this.tenantService.activeTenant()?.id ?? '';
    this.userForm.reset({
      email: '', password: '', full_name: '',
      tenant_id: activeTenantId, firm_id: '', role: 'viewer',
    });
    this.showUserForm.set(true);
  }

  cancelUserForm(): void {
    this.showUserForm.set(false);
    this.userForm.reset();
  }

  async saveUser(): Promise<void> {
    if (this.userForm.invalid) { this.userForm.markAllAsTouched(); return; }
    this.saving.set(true);
    try {
      const val = this.userForm.value;
      await this.settingsService.createUser({
        email: val.email!,
        password: val.password!,
        full_name: val.full_name!,
        tenant_id: val.tenant_id!,
        firm_id: val.firm_id || null,
        role: val.role as UserRole,
      });
      this.notificationService.success('Kullanıcı başarıyla oluşturuldu.');
      this.showUserForm.set(false);
      this.userForm.reset();
      await this.loadUsers();
    } catch (e: any) {
      this.notificationService.error(e?.message || 'Kullanıcı oluşturulurken hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteUser(id: string): void {
    this.userDeleteTargetId.set(id);
    this.showUserDeleteDialog.set(true);
  }

  cancelUserDelete(): void {
    this.showUserDeleteDialog.set(false);
    this.userDeleteTargetId.set(null);
  }

  async onUserDeleteConfirmed(): Promise<void> {
    const id = this.userDeleteTargetId();
    if (!id) return;
    try {
      await this.settingsService.deleteUser(id);
      this.notificationService.success('Kullanıcı silindi.');
      await this.loadUsers();
    } catch {
      this.notificationService.error('Kullanıcı silinirken hata oluştu.');
    } finally {
      this.showUserDeleteDialog.set(false);
      this.userDeleteTargetId.set(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 0: TENANT MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  tenants = signal<Tenant[]>([]);
  tenantEditingId = signal<string | null>(null);
  showTenantForm = signal(false);

  readonly planOptions = ['basic', 'pro', 'enterprise'] as const;
  readonly statusOptions = ['active', 'inactive', 'suspended'] as const;

  readonly planLabels: Record<string, string> = {
    basic: 'Temel', pro: 'Profesyonel', enterprise: 'Kurumsal',
  };

  readonly statusLabels: Record<string, string> = {
    active: 'Aktif', inactive: 'Pasif', suspended: 'Askıda',
  };

  tenantForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    tax_no: [''],
    status: ['active' as string, Validators.required],
    plan: ['basic' as string, Validators.required],
  });

  async loadTenants(): Promise<void> {
    this.loading.set(true);
    try {
      this.tenants.set(await this.settingsService.getTenants());
    } catch {
      this.notificationService.error('Gruplar yüklenirken hata oluştu.');
    } finally {
      this.loading.set(false);
    }
  }

  openNewTenant(): void {
    this.tenantEditingId.set(null);
    this.tenantForm.reset({ name: '', tax_no: '', status: 'active', plan: 'basic' });
    this.showTenantForm.set(true);
  }

  editTenant(tenant: Tenant): void {
    this.tenantEditingId.set(tenant.id);
    this.tenantForm.patchValue({
      name: tenant.name,
      tax_no: tenant.tax_no ?? '',
      status: tenant.status,
      plan: tenant.plan,
    });
    this.showTenantForm.set(true);
  }

  cancelTenantEdit(): void {
    this.tenantEditingId.set(null);
    this.showTenantForm.set(false);
    this.tenantForm.reset();
  }

  async saveTenant(): Promise<void> {
    if (this.tenantForm.invalid) { this.tenantForm.markAllAsTouched(); return; }
    this.saving.set(true);
    try {
      const val = this.tenantForm.value;
      const id = this.tenantEditingId();
      if (id) {
        await this.settingsService.updateTenant(id, val as Partial<Tenant>);
        this.notificationService.success('Grup güncellendi.');
      } else {
        const created = await this.settingsService.createTenant(val as Partial<Tenant>);
        this.notificationService.success('Grup oluşturuldu.');
        // Refresh tenant list in TenantService so topbar picks it up
        await this.tenantService.loadTenants();
      }
      this.tenantEditingId.set(null);
      this.showTenantForm.set(false);
      this.tenantForm.reset();
      await this.loadTenants();
    } catch {
      this.notificationService.error('Grup kaydedilirken hata oluştu.');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteTenant(id: string): void {
    this.deleteTargetId.set(id);
    this.deleteContext.set('tenant');
    this.showDeleteDialog.set(true);
  }

  selectTenantInTopbar(tenant: Tenant): void {
    this.tenantService.switchTenant(tenant);
    this.notificationService.info(`Aktif tenant: ${tenant.name}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE DIALOG SHARED
  // ─────────────────────────────────────────────────────────────────────────────

  cancelDelete(): void {
    this.showDeleteDialog.set(false);
    this.deleteTargetId.set(null);
  }

  async onDeleteConfirmed(): Promise<void> {
    const id = this.deleteTargetId();
    const ctx = this.deleteContext();
    if (!id) return;
    try {
      if (ctx === 'category') {
        await this.settingsService.deleteCategoryItem(id);
        this.notificationService.success('Kategori silindi.');
        await this.loadCategories();
      } else if (ctx === 'chart') {
        await this.settingsService.deleteChartOfAccount(id);
        this.notificationService.success('Hesap silindi.');
        await this.loadChartAccounts();
      } else if (ctx === 'tenant') {
        await this.settingsService.deleteTenant(id);
        this.notificationService.success('Grup silindi.');
        await this.tenantService.loadTenants();
        await this.loadTenants();
      } else if (ctx === 'firm') {
        // firm delete - handled in original code if needed
      }
    } catch {
      this.notificationService.error('Silme işlemi sırasında hata oluştu.');
    } finally {
      this.showDeleteDialog.set(false);
      this.deleteTargetId.set(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB NAVIGATION + INIT
  // ─────────────────────────────────────────────────────────────────────────────

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    this.loadTabData(tab);
  }

  private loadTabData(tab: TabId): void {
    if (tab === 'tenants') this.loadTenants();
    else if (tab === 'categories') this.loadCategories();
    else if (tab === 'chart') this.loadChartAccounts();
    else if (tab === 'firms') this.loadFirms();
    else if (tab === 'users') { this.loadTenants(); this.loadFirms(); this.loadUsers(); }
  }

  constructor() {
    // Load initial tab data once
    setTimeout(() => this.loadTabData(this.activeTab()), 0);
  }

  // ─── Template Helpers ─────────────────────────────────────────────────────────

  getDeleteTitle(): string {
    const map: Record<string, string> = { category: 'Kategoriyi Sil', chart: 'Hesabı Sil', firm: 'Firmayı Sil', tenant: 'Grubu Sil' };
    return map[this.deleteContext()] ?? 'Sil';
  }

  getDeleteMessage(): string {
    const map: Record<string, string> = {
      category: 'Bu kategoriyi silmek istediğinizden emin misiniz?',
      chart: 'Bu hesabı silmek istediğinizden emin misiniz? İlgili işlemler etkilenebilir.',
      firm: 'Bu firmayı silmek istediğinizden emin misiniz?',
      tenant: 'Bu grubu ve altındaki tüm firmaları silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!',
    };
    return map[this.deleteContext()] ?? 'Silmek istediğinizden emin misiniz?';
  }
}
