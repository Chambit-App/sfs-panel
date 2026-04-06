export type UserRole = 'super_admin' | 'tenant_admin' | 'firm_manager' | 'accountant' | 'viewer';

export interface AppUser {
  id: string;
  tenant_id: string;
  firm_id: string | null; // null = tenant-level access
  role: UserRole;
  full_name: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
}
