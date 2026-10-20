import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const assetsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./assets-page/assets-page.component').then(m => m.AssetsPageComponent),
    data: { title: 'Activos' },
  },
  {
    path: 'maintenance',
    loadComponent: () => import('./maintenance/maintenance-schedule-page.component').then(m => m.MaintenanceSchedulePageComponent),
    canActivate: [permissionGuard],
    data: { title: 'Cronograma de mantenimiento', permission: 'activos_mantenimientos.ver' },
  },
  {
    path: ':id',
    loadComponent: () => import('./asset-detail/asset-detail.component').then(m => m.AssetDetailComponent),
    data: { title: 'Ficha del activo' },
  },
];
