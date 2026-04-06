export interface BankAccount {
  id: string;
  firm_id: string;
  bank_name: string;
  account_no: string;
  iban?: string;
  currency: string;       // default 'TRY'
  is_active: boolean;
  created_at: string;
  // computed - not stored
  balance?: number;
}

export interface BankTransfer {
  id: string;
  firm_id: string;
  from_bank_id: string;
  to_bank_id: string;
  amount: number;
  date: string;
  description?: string;
  created_at: string;
}
