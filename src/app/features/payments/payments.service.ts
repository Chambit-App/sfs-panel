import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { Transaction, TransactionType, TransactionStatus } from '../../core/models/transaction.model';
import { CariAccount, CariType } from '../../core/models/cari-account.model';
import { BankAccount } from '../../core/models/bank-account.model';

export interface CategoryItem {
  id: string;
  firm_id: string;
  type: TransactionType;
  name: string;
  default_payment_term_days: number;
}

export interface DailyCashFlow {
  firm_id: string;
  due_date: string;
  total_gelir: number;
  total_gider: number;
  net: number;
}

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  async getTransactions(firmId: string, filters?: TransactionFilters): Promise<Transaction[]> {
    let query = this.client
      .from('transactions')
      .select('*, cari:cari_accounts(name), category:category_items(name), bank:bank_accounts(bank_name)')
      .eq('firm_id', firmId)
      .order('due_date', { ascending: true });

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.dateFrom) {
      query = query.gte('due_date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('due_date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      ...row,
      cari_name: (row['cari'] as { name: string } | null)?.name ?? '',
      category_name: (row['category'] as { name: string } | null)?.name ?? '',
      bank_name: (row['bank'] as { bank_name: string } | null)?.bank_name ?? '',
    })) as unknown as Transaction[];
  }

  async createTransaction(data: Partial<Transaction>): Promise<Transaction> {
    const { data: created, error } = await this.client
      .from('transactions')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }

    return created as Transaction;
  }

  async updateTransaction(id: string, data: Partial<Transaction>): Promise<void> {
    const { error } = await this.client
      .from('transactions')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  }

  async updateStatus(id: string, status: TransactionStatus): Promise<void> {
    const { error } = await this.client
      .from('transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating transaction status:', error);
      throw error;
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await this.client
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting transaction:', error);
      throw error;
    }
  }

  async getCariAccounts(firmId: string, type?: CariType): Promise<CariAccount[]> {
    let query = this.client
      .from('cari_accounts')
      .select('*')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .order('name');

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching cari accounts:', error);
      throw error;
    }

    return (data ?? []) as CariAccount[];
  }

  async getCategoryItems(firmId: string, type?: TransactionType): Promise<CategoryItem[]> {
    let query = this.client
      .from('category_items')
      .select('*')
      .eq('firm_id', firmId)
      .order('name');

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching category items:', error);
      throw error;
    }

    return (data ?? []) as CategoryItem[];
  }

  async getBankAccounts(firmId: string): Promise<BankAccount[]> {
    const { data, error } = await this.client
      .from('bank_accounts')
      .select('*')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .order('bank_name');

    if (error) {
      console.error('Error fetching bank accounts:', error);
      throw error;
    }

    return (data ?? []) as BankAccount[];
  }

  async createCategoryItem(data: Partial<CategoryItem>): Promise<CategoryItem> {
    const { data: created, error } = await this.client
      .from('category_items')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as CategoryItem;
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

  async getDailyCashFlow(firmId: string, month: number, year: number): Promise<DailyCashFlow[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await this.client
      .from('daily_cash_flow')
      .select('*')
      .eq('firm_id', firmId)
      .gte('due_date', startDate)
      .lte('due_date', endDate);

    if (error) {
      console.error('Error fetching daily cash flow:', error);
      // Return empty array on error - view might not exist yet
      return [];
    }

    return (data ?? []) as DailyCashFlow[];
  }
}
