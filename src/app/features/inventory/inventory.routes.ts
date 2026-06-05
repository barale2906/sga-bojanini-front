import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const inventoryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'patient-records',
    loadComponent: () =>
      import('./patient-records/patient-records-page.component').then(
        (m) => m.PatientRecordsPageComponent,
      ),
    canActivate: [permissionGuard],
    data: { title: 'Registros de Procedimientos', permission: 'registros_procedimientos.ver' },
  },
];
