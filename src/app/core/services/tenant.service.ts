import { Injectable, inject, signal } from '@angular/core';
import { Tenant } from '../models/tenant.model';
import { Firm } from '../models/firm.model';
import { SupabaseService } from './supabase.service';

const STORAGE_TENANT_KEY = 'sfs_active_tenant_id';
const STORAGE_FIRM_KEY = 'sfs_active_firm_id';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private supabaseService = inject(SupabaseService);

  tenants = signal<Tenant[]>([]);
  firms = signal<Firm[]>([]);
  activeTenant = signal<Tenant | null>(null);
  activeFirm = signal<Firm | null>(null);

  async loadTenants(): Promise<void> {
    const { data, error } = await this.supabaseService.client
      .from('tenants')
      .select('*')
      .order('name');

    if (error) {
      console.error('Failed to load tenants:', error);
      return;
    }

    this.tenants.set((data as Tenant[]) ?? []);

    // Restore previously selected tenant from localStorage
    const savedTenantId = localStorage.getItem(STORAGE_TENANT_KEY);
    if (savedTenantId) {
      const saved = (data as Tenant[]).find(t => t.id === savedTenantId);
      if (saved) {
        this.activeTenant.set(saved);
        // Load firms for the restored tenant
        await this.loadFirms();
      }
    }
  }

  async loadFirms(): Promise<void> {
    const tenant = this.activeTenant();
    if (!tenant) return;

    const { data, error } = await this.supabaseService.client
      .from('firms')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to load firms:', error);
      return;
    }

    this.firms.set((data as Firm[]) ?? []);

    // Restore previously selected firm from localStorage
    const savedFirmId = localStorage.getItem(STORAGE_FIRM_KEY);
    if (savedFirmId) {
      const saved = (data as Firm[]).find(f => f.id === savedFirmId);
      if (saved) {
        this.activeFirm.set(saved);
        return;
      }
    }

    // Auto-select first firm if none restored
    if ((data as Firm[]).length > 0 && !this.activeFirm()) {
      this.activeFirm.set((data as Firm[])[0]);
    }
  }

  switchTenant(tenant: Tenant): void {
    this.activeFirm.set(null);
    localStorage.removeItem(STORAGE_FIRM_KEY);
    this.activeTenant.set(tenant);
    localStorage.setItem(STORAGE_TENANT_KEY, tenant.id);
    this.loadFirms();
  }

  switchFirm(firm: Firm | null): void {
    this.activeFirm.set(firm);
    if (firm) {
      localStorage.setItem(STORAGE_FIRM_KEY, firm.id);
    } else {
      localStorage.removeItem(STORAGE_FIRM_KEY);
    }
  }

  clearContext(): void {
    this.activeTenant.set(null);
    this.activeFirm.set(null);
    this.tenants.set([]);
    this.firms.set([]);
    localStorage.removeItem(STORAGE_TENANT_KEY);
    localStorage.removeItem(STORAGE_FIRM_KEY);
  }
}
