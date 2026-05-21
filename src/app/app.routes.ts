import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

export const routes: Routes = [
  // Login (público)
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },

  // Rutas protegidas dentro del layout
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Dashboard
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'Dashboard' },
      },

      // Usuarios
      {
        path: 'users',
        loadComponent: () =>
          import('./features/auth/users/user-list.component').then((m) => m.UserListComponent),
        data: { title: 'Usuarios', permission: 'users.view' },
      },
      {
        path: 'users/new',
        loadComponent: () =>
          import('./features/auth/users/user-form.component').then((m) => m.UserFormComponent),
        data: { title: 'Nuevo Usuario', permission: 'users.create' },
      },
      {
        path: 'users/:id/edit',
        loadComponent: () =>
          import('./features/auth/users/user-form.component').then((m) => m.UserFormComponent),
        data: { title: 'Editar Usuario', permission: 'users.update' },
      },

      // Roles
      {
        path: 'roles',
        loadComponent: () =>
          import('./features/auth/roles/role-list.component').then((m) => m.RoleListComponent),
        data: { title: 'Roles', permission: 'roles.view' },
      },

      // Perfil y contraseña
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/auth/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'profile/password',
        loadComponent: () =>
          import('./features/auth/profile/profile.component').then((m) => m.ProfileComponent),
      },

      // Almacenes (Fase 2)
      {
        path: 'warehouses',
        loadChildren: () =>
          import('./features/warehouse/warehouse.routes').then((m) => m.warehouseRoutes),
        data: { permission: 'warehouses.view' },
      },

      // Catálogo (Fase 3)
      {
        path: 'catalog',
        loadChildren: () =>
          import('./features/catalog/catalog.routes').then((m) => m.catalogRoutes),
        data: { permission: 'products.view' },
      },

      // Inventario (Fase 4)
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
        data: { permission: 'stock.view' },
      },

      // Compras (Fase 5)
      {
        path: 'purchasing',
        loadChildren: () =>
          import('./features/purchasing/purchasing.routes').then((m) => m.purchasingRoutes),
        data: { permission: 'purchase_orders.view' },
      },

      // Monitoreo (Fase 6)
      {
        path: 'monitoring',
        loadChildren: () =>
          import('./features/monitoring/monitoring.routes').then((m) => m.monitoringRoutes),
        data: { permission: 'sensors.view' },
      },

      // Auditoría (Fase 7)
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/audit/audit-page.component').then((m) => m.AuditPageComponent),
        data: { permission: 'audit.view' },
      },

      // Integraciones (Fase 8)
      {
        path: 'integrations',
        loadChildren: () =>
          import('./features/integration/integration.routes').then((m) => m.integrationRoutes),
        data: { permission: 'integrations.view' },
      },

      // Reportes (Fase 9)
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent),
        data: { permission: 'reports.view' },
      },

      // Notificaciones (Fase 10)
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notification-list.component').then(
            (m) => m.NotificationListComponent
          ),
        data: { permission: 'notifications.view' },
      },
    ],
  },

  // Catch-all
  { path: '**', redirectTo: '' },
];
