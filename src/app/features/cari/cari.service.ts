import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { CariAccount, CariType } from '../../core/models/cari-account.model';
import { Transaction } from '../../core/models/transaction.model';

export interface CariAccountWithBalance {
  id: string;
  firm_id: string;
  type: CariType;
  name: string;
  tax_no?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_term_days: number;
  is_active: boolean;
  total_gelir: number;
  total_gider: number;
  net_balance: number;
  overdue_count: number;
  overdue_amount: number;
}

export interface CariReportRow {
  cari_id: string;
  cari_name: string;
  cari_type: CariType;
  year: number;
  month: number;
  gelir_total: number;
  gider_total: number;
  net: number;
}

@Injectable({ providedIn: 'root' })
export class CariService {
  private supabaseService = inject(SupabaseService);

  private get client() {
    return this.supabaseService.client;
  }

  async getCariAccounts(firmId: string, type?: CariType): Promise<CariAccountWithBalance[]> {
    let query = this.client
      .from('cari_account_balances')
      .select('*')
      .eq('firm_id', firmId)
      .order('name');

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching cari accounts:', error);
      return [];
    }

    return (data ?? []) as CariAccountWithBalance[];
  }

  async getCariAccount(id: string): Promise<CariAccount> {
    const { data, error } = await this.client
      .from('cari_accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as CariAccount;
  }

  async createCari(data: Partial<CariAccount>): Promise<CariAccount> {
    const { data: created, error } = await this.client
      .from('cari_accounts')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return created as CariAccount;
  }

  async updateCari(id: string, data: Partial<CariAccount>): Promise<void> {
    const { error } = await this.client
      .from('cari_accounts')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteCari(id: string): Promise<void> {
    const { error } = await this.client
      .from('cari_accounts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getCariTransactions(cariId: string): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from('transactions')
      .select('*')
      .eq('cari_id', cariId)
      .order('invoice_date', { ascending: false });

    if (error) {
      console.error('Error fetching cari transactions:', error);
      return [];
    }

    return (data ?? []) as Transaction[];
  }

  async getCariReport(
    firmId: string,
    filters?: { type?: CariType; dateFrom?: string; dateTo?: string }
  ): Promise<CariReportRow[]> {
    let query = this.client
      .from('transactions')
      .select('cari_id, cari_accounts!inner(name, type, firm_id), type, amount, invoice_date')
      .eq('cari_accounts.firm_id', firmId)
      .eq('status', 'ODENDI');

    if (filters?.dateFrom) {
      query = query.gte('invoice_date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('invoice_date', filters.dateTo);
    }
    if (filters?.type) {
      query = query.eq('cari_accounts.type', filters.type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching cari report:', error);
      return [];
    }

    // Aggregate by cari + year + month
    const map = new Map<string, CariReportRow>();

    for (const row of data ?? []) {
      const cariRaw = row['cari_accounts'];
      const cariInfoRaw = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
      const cariInfo = cariInfoRaw as unknown as { name: string; type: CariType } | null;
      if (!cariInfo) continue;

      const date = new Date(row['invoice_date']);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${row['cari_id']}_${year}_${month}`;

      if (!map.has(key)) {
        map.set(key, {
          cari_id: row['cari_id'],
          cari_name: cariInfo.name,
          cari_type: cariInfo.type,
          year,
          month,
          gelir_total: 0,
          gider_total: 0,
          net: 0,
        });
      }

      const entry = map.get(key)!;
      const amount = (row['amount'] as number) ?? 0;
      if (row['type'] === 'GELIR') {
        entry.gelir_total += amount;
      } else if (row['type'] === 'GIDER') {
        entry.gider_total += amount;
      }
      entry.net = entry.gelir_total - entry.gider_total;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return a.cari_name.localeCompare(b.cari_name, 'tr');
    });
  }
}
