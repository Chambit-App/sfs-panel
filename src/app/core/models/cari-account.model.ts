export type CariType = 'MUSTERI' | 'TEDARIKCI';

export interface CariAccount {
  id: string;
  firm_id: string;
  type: CariType;
  name: string;
  tax_no?: string;
  phone?: string;
  address?: string;
  payment_term_days: number;  // default VADE
  is_active: boolean;
  created_at: string;
}
