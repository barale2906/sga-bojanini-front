import { Routes } from '@angular/router';

export const purchasingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./purchasing-page.component').then((m) => m.PurchasingPageComponent),
  },
];
