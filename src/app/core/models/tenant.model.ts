export interface Tenant {
  id: string;
  name: string;
  tax_no: string;
  status: 'active' | 'inactive' | 'suspended';
  plan: 'basic' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
}
