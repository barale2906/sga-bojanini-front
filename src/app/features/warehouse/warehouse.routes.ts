import { Routes } from '@angular/router';

export const warehouseRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./warehouses/warehouse-page.component').then((m) => m.WarehousePageComponent),
  },
];
