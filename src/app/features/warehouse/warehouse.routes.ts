import { Routes } from '@angular/router';

export const warehouseRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./warehouse-list.component').then((m) => m.WarehouseListComponent),
  },
];
