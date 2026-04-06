export type AccountType = 'GELIR' | 'GIDER';

export interface ChartOfAccounts {
  id: string;
  firm_id: string;
  code: string;          // e.g. "600.10.01"
  name: string;          // e.g. "KONAKLAMA GELİRLERİ"
  type: AccountType;
  parent_code: string | null;
  is_active: boolean;
}
