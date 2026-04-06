import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { Tenant } from '../../core/models/tenant.model';
import { Firm } from '../../core/models/firm.model';
import { AppUser, UserRole } from '../../core/models/user.model';
import { ChartOfAccounts } from '../../core/models/chart-of-accounts.model';

export interface CategoryItem {
  id: string;
  firm_id: string;
  chart_account_id: string | null;
  type: 'GELIR' | 'GIDER';
  name: string;
  default_payment_term_days: number;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  // ─── Category Items ───────────────────────────────────────────────────────────

  async getCategoryItems(firmId: string): Promise<CategoryItem[]> {
    const { data, error } = await this.client
      .from('category_items')
      .select('*')
      .eq('firm_id', firmId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as CategoryItem[];
  }

  async createCategoryItem(data: Partial<CategoryItem>): Promise<void> {
    const { error } = await this.client
      .from('category_items')
      .insert(data);
    if (error) throw error;
  }

  async updateCategoryItem(id: string, data: Partial<CategoryItem>): Promise<void> {
    const { error } = await this.client
      .from('category_items')
      .update(data)
      .eq('id', id);
    if (error) throw error;
  }

  async deleteCategoryItem(id: string): Promise<void> {
    const { error } = await this.client
      .from('category_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async toggleCategoryItemActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.client
      .from('category_items')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw error;
  }

  // ─── Chart of Accounts ────────────────────────────────────────────────────────

  async getChartOfAccounts(firmId: string): Promise<ChartOfAccounts[]> {
    const { data, error } = await this.client
      .from('chart_of_accounts')
      .select('*')
      .eq('firm_id', firmId)
      .order('code');
    if (error) throw error;
    return (data ?? []) as ChartOfAccounts[];
  }

  async createChartOfAccount(data: Partial<ChartOfAccounts>): Promise<void> {
    const { error } = await this.client
      .from('chart_of_accounts')
      .insert(data);
    if (error) throw error;
  }

  async updateChartOfAccount(id: string, data: Partial<ChartOfAccounts>): Promise<void> {
    const { error } = await this.client
      .from('chart_of_accounts')
      .update(data)
      .eq('id', id);
    if (error) throw error;
  }

  async deleteChartOfAccount(id: string): Promise<void> {
    const { error } = await this.client
      .from('chart_of_accounts')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async toggleChartOfAccountActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.client
      .from('chart_of_accounts')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw error;
  }

  // ─── Tenant Management ────────────────────────────────────────────────────────

  async getTenants(): Promise<Tenant[]> {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []) as Tenant[];
  }

  async createTenant(data: Partial<Tenant>): Promise<Tenant> {
    const { data: created, error } = await this.client
      .from('tenants')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as Tenant;
  }

  async updateTenant(id: string, data: Partial<Tenant>): Promise<void> {
    const { error } = await this.client
      .from('tenants')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteTenant(id: string): Promise<void> {
    const { error } = await this.client
      .from('tenants')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ─── Firm Management ──────────────────────────────────────────────────────────

  async getFirms(tenantId: string): Promise<Firm[]> {
    const { data, error } = await this.client
      .from('firms')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as Firm[];
  }

  async createFirm(data: Partial<Firm>): Promise<void> {
    const { error } = await this.client
      .from('firms')
      .insert(data);
    if (error) throw error;
  }

  async updateFirm(id: string, data: Partial<Firm>): Promise<void> {
    const { error } = await this.client
      .from('firms')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async toggleFirmActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.client
      .from('firms')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  // ─── User Management ─────────────────────────────────────────────────────────

  async getUsers(tenantId: string): Promise<AppUser[]> {
    const { data, error } = await this.client
      .from('user_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('full_name');
    if (error) throw error;
    return (data ?? []) as AppUser[];
  }

  async updateUserRole(id: string, role: UserRole): Promise<void> {
    const { error } = await this.client
      .from('user_profiles')
      .update({ role })
      .eq('id', id);
    if (error) throw error;
  }

  async toggleUserActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.client
      .from('user_profiles')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw error;
  }

  async createUser(userData: {
    email: string;
    password: string;
    full_name: string;
    tenant_id: string;
    firm_id: string | null;
    role: UserRole;
  }): Promise<void> {
    // Call the create-user edge function (service role key stays server-side)
    const { data, error } = await this.client.functions.invoke('create-user', {
      body: {
        email: userData.email,
        password: userData.password,
        full_name: userData.full_name,
        tenant_id: userData.tenant_id,
        firm_id: userData.firm_id || null,
        role: userData.role,
      },
    });

    if (error) throw new Error(error.message || 'Kullanıcı oluşturulamadı.');
    if (data?.error) throw new Error(data.error);
  }

  async deleteUser(id: string): Promise<void> {
    // Delete profile (auth user remains but can't access anything)
    const { error } = await this.client
      .from('user_profiles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
