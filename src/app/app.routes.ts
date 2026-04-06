import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'payments', loadComponent: () => import('./features/payments/payments.component').then(m => m.PaymentsComponent) },
      { path: 'cari', loadComponent: () => import('./features/cari/cari.component').then(m => m.CariComponent) },
      { path: 'bank', loadComponent: () => import('./features/bank/bank.component').then(m => m.BankComponent) },
      { path: 'budget', loadComponent: () => import('./features/budget/budget.component').then(m => m.BudgetComponent) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'consolidated', loadComponent: () => import('./features/consolidated/consolidated.component').then(m => m.ConsolidatedComponent) },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
        canActivate: [roleGuard(['super_admin'])],
      },
    ]
  },
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) },
  { path: '**', redirectTo: 'dashboard' }
];
