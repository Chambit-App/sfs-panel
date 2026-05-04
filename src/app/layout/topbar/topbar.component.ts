import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { Tenant } from '../../core/models/tenant.model';
import { Firm } from '../../core/models/firm.model';

@Component({
  selector: 'app-topbar',
  standalone: true,
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  protected auth = inject(AuthService);
  protected tenantService = inject(TenantService);

  showHamburger = input(false);
  hamburgerClick = output<void>();

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeDropdowns();
  }

  tenantDropdownOpen = signal(false);
  firmDropdownOpen = signal(false);

  get roleLabel(): string {
    const role = this.auth.currentUser()?.role;
    const labels: Record<string, string> = {
      super_admin: 'Süper Admin',
      tenant_admin: 'Grup Yöneticisi',
      firm_manager: 'Firma Yöneticisi',
      accountant: 'Muhasebeci',
      viewer: 'İzleyici',
    };
    return role ? (labels[role] ?? role) : '';
  }

  get roleClass(): string {
    const role = this.auth.currentUser()?.role;
    if (role === 'super_admin') return 'badge--danger';
    if (role === 'tenant_admin') return 'badge--info';
    if (role === 'firm_manager') return 'badge--warning';
    return 'badge--neutral';
  }

  toggleTenantDropdown(): void {
    this.tenantDropdownOpen.update(v => !v);
    this.firmDropdownOpen.set(false);
  }

  toggleFirmDropdown(): void {
    this.firmDropdownOpen.update(v => !v);
    this.tenantDropdownOpen.set(false);
  }

  selectTenant(tenant: Tenant): void {
    this.tenantService.switchTenant(tenant);
    this.tenantDropdownOpen.set(false);
  }

  selectFirm(firm: Firm | null): void {
    this.tenantService.switchFirm(firm);
    this.firmDropdownOpen.set(false);
  }

  closeDropdowns(): void {
    this.tenantDropdownOpen.set(false);
    this.firmDropdownOpen.set(false);
  }

  onHamburgerClick(event: Event): void {
    event.stopPropagation();
    this.hamburgerClick.emit();
  }

  async signOut(): Promise<void> {
    this.tenantService.clearContext();
    await this.auth.signOut();
  }
}
