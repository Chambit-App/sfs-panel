import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';
import { Firm } from '../../core/models/firm.model';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  exact?: boolean;
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

  reportsExpanded = signal(true);
  firmDropdownOpen = signal(false);

  // Reports section - rendered as a special collapsible block.
  reportItems: NavItem[] = [
    { label: 'Gelir-Gider Tablosu', path: '/reports', icon: 'table_chart', exact: true },
    { label: 'Bütçe Performans', path: '/reports/budget', icon: 'savings' },
    { label: 'Cari Yaşlandırma', path: '/reports/aging', icon: 'schedule' },
    { label: 'Gider Dağılımı', path: '/reports/expense-breakdown', icon: 'pie_chart' },
    { label: 'Geciken İşlemler', path: '/reports/overdue', icon: 'warning' },
  ];

  consolidatedItem: NavItem = { label: 'Konsolide', path: '/consolidated', icon: 'view_module' };

  // Standard groups (everything except Reports).
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
    this.firmDropdownOpen.set(false);
  }

  toggleReports(): void {
    if (this.collapsed()) return;
    this.reportsExpanded.update(v => !v);
  }

  toggleFirmDropdown(event: Event): void {
    event.stopPropagation();
    this.firmDropdownOpen.update(v => !v);
  }

  selectFirm(firm: Firm): void {
    this.tenantService.switchFirm(firm);
    this.firmDropdownOpen.set(false);
  }

  closeFirmDropdown(): void {
    this.firmDropdownOpen.set(false);
  }
}
