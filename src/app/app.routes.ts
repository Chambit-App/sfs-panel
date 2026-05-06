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
      { path: 'payments/import', loadComponent: () => import('./features/excel-import/excel-import.component').then(m => m.ExcelImportComponent), data: { schemaKey: 'payments' } },
      { path: 'cari', loadComponent: () => import('./features/cari/cari.component').then(m => m.CariComponent) },
      { path: 'cari/import', loadComponent: () => import('./features/excel-import/excel-import.component').then(m => m.ExcelImportComponent), data: { schemaKey: 'cari' } },
      { path: 'cari/tahsilat-import', loadComponent: () => import('./features/tahsilat-import/tahsilat-import.component').then(m => m.TahsilatImportComponent) },
      { path: 'bank', loadComponent: () => import('./features/bank/bank.component').then(m => m.BankComponent) },
      { path: 'bank/import', loadComponent: () => import('./features/excel-import/excel-import.component').then(m => m.ExcelImportComponent), data: { schemaKey: 'bank' } },
      { path: 'budget', loadComponent: () => import('./features/budget/budget.component').then(m => m.BudgetComponent) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'reports/budget', loadComponent: () => import('./features/reports/budget-performance/budget-performance.component').then(m => m.BudgetPerformanceComponent) },
      { path: 'reports/aging', loadComponent: () => import('./features/reports/cari-aging/cari-aging.component').then(m => m.CariAgingComponent) },
      { path: 'reports/expense-breakdown', loadComponent: () => import('./features/reports/expense-breakdown/expense-breakdown.component').then(m => m.ExpenseBreakdownComponent) },
      { path: 'reports/overdue', loadComponent: () => import('./features/reports/overdue-transactions/overdue-transactions.component').then(m => m.OverdueTransactionsComponent) },
      { path: 'reports/top-cari', loadComponent: () => import('./features/reports/top-cari/top-cari.component').then(m => m.TopCariComponent) },
      { path: 'reports/rolling-trend', loadComponent: () => import('./features/reports/rolling-trend/rolling-trend.component').then(m => m.RollingTrendComponent) },
      { path: 'reports/bank-trend', loadComponent: () => import('./features/reports/bank-trend/bank-trend.component').then(m => m.BankTrendComponent) },
      { path: 'reports/payment-schedule', loadComponent: () => import('./features/reports/payment-schedule/payment-schedule.component').then(m => m.PaymentScheduleComponent) },
      { path: 'reports/bank-statement', loadComponent: () => import('./features/reports/bank-statement/bank-statement.component').then(m => m.BankStatementComponent) },
      { path: 'reports/dso-dpo', loadComponent: () => import('./features/reports/dso-dpo/dso-dpo.component').then(m => m.DsoDpoComponent) },
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
