import { Routes } from '@angular/router';
export const purchasingRoutes: Routes = [
  { path: '', loadComponent: () => import('./purchasing.component').then(m => m.PurchasingComponent) },
];
