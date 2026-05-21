import { Routes } from '@angular/router';

export const inventoryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./inventory-page.component').then((m) => m.InventoryPageComponent),
  },
];
