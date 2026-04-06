import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { BankAccount, BankTransfer } from '../../core/models/bank-account.model';
import { Transaction } from '../../core/models/transaction.model';

export interface BankAccountWithBalance extends BankAccount {
  balance: number;
}

export interface BankTransferWithNames extends BankTransfer {
  from_bank_name: string;
  to_bank_name: string;
}

export interface TransferFilters {
  dateFrom?: string;
  dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class BankService {
  private supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.client;
  }

  async getBankAccounts(firmId: string): Promise<BankAccountWithBalance[]> {
    const { data, error } = await this.client
      .from('bank_account_balances')
      .select('*')
      .eq('firm_id', firmId)
      .order('bank_name');

    if (error) {
      console.error('Error fetching bank accounts:', error);
      throw error;
    }

    return (data ?? []).map(row => ({
      ...row,
      balance: (row as Record<string, unknown>)['balance'] as number ?? 0,
    })) as BankAccountWithBalance[];
  }

  async createBankAccount(data: Partial<BankAccount>): Promise<BankAccount> {
    const { data: created, error } = await this.client
      .from('bank_accounts')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating bank account:', error);
      throw error;
    }

    return created as BankAccount;
  }

  async updateBankAccount(id: string, data: Partial<BankAccount>): Promise<void> {
    const { error } = await this.client
      .from('bank_accounts')
      .update(data)
      .eq('id', id);

    if (error) {
      console.error('Error updating bank account:', error);
      throw error;
    }
  }

  async deleteBankAccount(id: string): Promise<void> {
    const { error } = await this.client
      .from('bank_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting bank account:', error);
      throw error;
    }
  }

  async getTransfers(firmId: string, filters?: TransferFilters): Promise<BankTransferWithNames[]> {
    let query = this.client
      .from('bank_transfers')
      .select('*, from_bank:bank_accounts!from_bank_id(bank_name, account_no), to_bank:bank_accounts!to_bank_id(bank_name, account_no)')
      .eq('firm_id', firmId)
      .order('date', { ascending: false });

    if (filters?.dateFrom) {
      query = query.gte('date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transfers:', error);
      throw error;
    }

    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      ...row,
      from_bank_name: `${(row['from_bank'] as { bank_name: string; account_no: string } | null)?.bank_name ?? ''} - ${(row['from_bank'] as { bank_name: string; account_no: string } | null)?.account_no ?? ''}`.trim(),
      to_bank_name: `${(row['to_bank'] as { bank_name: string; account_no: string } | null)?.bank_name ?? ''} - ${(row['to_bank'] as { bank_name: string; account_no: string } | null)?.account_no ?? ''}`.trim(),
    })) as unknown as BankTransferWithNames[];
  }

  async createTransfer(data: Partial<BankTransfer>): Promise<BankTransfer> {
    const { data: created, error } = await this.client
      .from('bank_transfers')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating transfer:', error);
      throw error;
    }

    return created as BankTransfer;
  }

  async deleteTransfer(id: string): Promise<void> {
    const { error } = await this.client
      .from('bank_transfers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting transfer:', error);
      throw error;
    }
  }

  async getBankTransactions(bankId: string): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from('transactions')
      .select('*, cari:cari_accounts(name), category:category_items(name)')
      .eq('bank_id', bankId)
      .order('due_date', { ascending: false });

    if (error) {
      console.error('Error fetching bank transactions:', error);
      throw error;
    }

    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      ...row,
      cari_name: (row['cari'] as { name: string } | null)?.name ?? '',
      category_name: (row['category'] as { name: string } | null)?.name ?? '',
    })) as unknown as Transaction[];
  }
}
