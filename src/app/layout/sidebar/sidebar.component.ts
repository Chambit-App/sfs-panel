import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavGroup {
  groupLabel: string;
  items: NavItem[];
  superAdminOnly?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected tenantService = inject(TenantService);
  protected auth = inject(AuthService);

  collapsed = signal(false);
  mobileOpen = input(false);
  closeMobile = output<void>();

  private allNavGroups: NavGroup[] = [
    {
      groupLabel: 'Ana Sayfa',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
      ],
    },
    {
      groupLabel: 'Finans',
      items: [
        { label: 'Ödemeler', path: '/payments', icon: 'payments' },
        { label: 'Cari Hesaplar', path: '/cari', icon: 'people' },
        { label: 'Banka', path: '/bank', icon: 'account_balance' },
      ],
    },
    {
      groupLabel: 'Planlama',
      items: [
        { label: 'Bütçe', path: '/budget', icon: 'savings' },
      ],
    },
    {
      groupLabel: 'Raporlar',
      items: [
        { label: 'Raporlar', path: '/reports', icon: 'bar_chart' },
        { label: 'Konsolide', path: '/consolidated', icon: 'table_chart' },
      ],
    },
    {
      groupLabel: 'Yönetim',
      superAdminOnly: true,
      items: [
        { label: 'Ayarlar', path: '/settings', icon: 'settings' },
      ],
    },
  ];

  navGroups = computed(() => {
    const isSuperAdmin = this.auth.isSuperAdmin();
    return this.allNavGroups.filter(g => !g.superAdminOnly || isSuperAdmin);
  });

  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }

  onNavClick(): void {
    this.closeMobile.emit();
  }
}
