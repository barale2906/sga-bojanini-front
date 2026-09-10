import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const inventoryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'entry',
    loadComponent: () =>
      import('./movements/entry-page.component').then((m) => m.EntryPageComponent),
    canActivate: [permissionGuard],
    data: { title: 'Nueva Entrada de Mercancía', permission: 'movimientos.entrada' },
  },
  {
    path: 'exit',
    loadComponent: () =>
      import('./movements/exit-page.component').then((m) => m.ExitPageComponent),
    canActivate: [permissionGuard],
    data: { title: 'Nueva Salida de Stock', permission: 'movimientos.salida' },
  },
  {
    path: 'transfer',
    loadComponent: () =>
      import('./movements/transfer-page.component').then((m) => m.TransferPageComponent),
    canActivate: [permissionGuard],
    data: { title: 'Nuevo Traslado entre Almacenes', permission: 'movimientos.transferir' },
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
  {
    path: 'clinical-templates',
    loadComponent: () =>
      import('./clinical-templates/clinical-templates-page.component').then(
        (m) => m.ClinicalTemplatesPageComponent,
      ),
    canActivate: [permissionGuard],
    data: { title: 'Plantillas de Evolución Clínica', permission: 'plantillas_clinicas.ver' },
  },
];
