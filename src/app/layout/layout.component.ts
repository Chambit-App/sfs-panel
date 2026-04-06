import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';
import { AuthService } from '../core/services/auth.service';
import { TenantService } from '../core/services/tenant.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent implements OnInit {
  private auth = inject(AuthService);
  private tenantService = inject(TenantService);

  sidebarOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  async ngOnInit(): Promise<void> {
    // Load tenants - this restores selection from localStorage if available
    await this.tenantService.loadTenants();

    // Only auto-select if nothing was restored from localStorage
    if (!this.tenantService.activeTenant() && this.tenantService.tenants().length > 0) {
      const user = this.auth.currentUser();
      if (user?.is_super_admin) {
        this.tenantService.switchTenant(this.tenantService.tenants()[0]);
      } else if (user?.tenant_id) {
        const userTenant = this.tenantService.tenants().find(t => t.id === user.tenant_id);
        if (userTenant) this.tenantService.switchTenant(userTenant);
      }
    }
  }
}
