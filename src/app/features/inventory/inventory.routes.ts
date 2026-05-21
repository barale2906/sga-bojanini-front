import { Routes } from '@angular/router';
export const inventoryRoutes: Routes = [
  { path: '', loadComponent: () => import('./inventory.component').then(m => m.InventoryComponent) },
];
