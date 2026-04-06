export type TransactionType = 'GELIR' | 'GIDER';
export type TransactionStatus = 'BEKLIYOR' | 'ODENDI' | 'IPTAL';

export interface Transaction {
  id: string;
  firm_id: string;
  cari_id: string;
  category_id: string;
  bank_id: string | null;
  type: TransactionType;
  invoice_no?: string;
  invoice_date: string;
  due_date: string;
  payment_term_days: number;
  amount: number;
  status: TransactionStatus;
  description?: string;
  created_at: string;
  updated_at: string;
  // joined fields
  cari_name?: string;
  category_name?: string;
  bank_name?: string;
}
