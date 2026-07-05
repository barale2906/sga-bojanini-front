import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
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
        canActivate: [permissionGuard],
        data: { title: 'Usuarios', permission: 'usuarios.ver' },
      },
      {
        path: 'users/new',
        loadComponent: () =>
          import('./features/auth/users/user-form.component').then((m) => m.UserFormComponent),
        canActivate: [permissionGuard],
        data: { title: 'Nuevo Usuario', permission: 'usuarios.crear' },
      },
      {
        path: 'users/:id/edit',
        loadComponent: () =>
          import('./features/auth/users/user-form.component').then((m) => m.UserFormComponent),
        canActivate: [permissionGuard],
        data: { title: 'Editar Usuario', permission: 'usuarios.editar' },
      },

      // Roles
      {
        path: 'roles',
        loadComponent: () =>
          import('./features/auth/roles/role-list.component').then((m) => m.RoleListComponent),
        canActivate: [permissionGuard],
        data: { title: 'Roles', permission: 'roles.ver' },
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
        canActivate: [permissionGuard],
        data: { permission: 'almacenes.ver' },
      },

      // Catálogo (Fase 3)
      {
        path: 'catalog',
        loadChildren: () =>
          import('./features/catalog/catalog.routes').then((m) => m.catalogRoutes),
        canActivate: [permissionGuard],
        data: { permission: 'productos.ver' },
      },

      // Inventario (Fase 4)
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
        canActivate: [permissionGuard],
        data: { permission: 'stock.ver' },
      },

      // Centros de Costo
      {
        path: 'cost-centers',
        loadChildren: () =>
          import('./features/cost-centers/cost-centers.routes').then((m) => m.costCentersRoutes),
        canActivate: [permissionGuard],
        data: { title: 'Centros de Costo', permission: 'centros_costo.ver' },
      },

      // Compras (Fase 5)
      {
        path: 'purchasing',
        loadChildren: () =>
          import('./features/purchasing/purchasing.routes').then((m) => m.purchasingRoutes),
        canActivate: [permissionGuard],
        data: { permission: 'ordenes_compra.ver' },
      },

      // Monitoreo (Fase 6)
      {
        path: 'monitoring',
        loadChildren: () =>
          import('./features/monitoring/monitoring.routes').then((m) => m.monitoringRoutes),
        canActivate: [permissionGuard],
        data: { permission: 'sensores.ver' },
      },

      // Auditoría (Fase 7)
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/audit/audit-page.component').then((m) => m.AuditPageComponent),
        canActivate: [permissionGuard],
        data: { permission: 'auditoria.ver' },
      },

      // Integraciones (Fase 8)
      {
        path: 'integrations',
        loadChildren: () =>
          import('./features/integration/integration.routes').then((m) => m.integrationRoutes),
        canActivate: [permissionGuard],
        data: { permission: 'integraciones.ver' },
      },

      // Reportes (Fase 9)
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent),
        canActivate: [permissionGuard],
        data: { permission: 'reportes.ver' },
      },

      // Notificaciones (Fase 10)
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notification-list.component').then(
            (m) => m.NotificationListComponent
          ),
        canActivate: [permissionGuard],
        data: { permission: 'notificaciones.ver' },
      },
    ],
  },

  // Catch-all
  { path: '**', redirectTo: '' },
];
