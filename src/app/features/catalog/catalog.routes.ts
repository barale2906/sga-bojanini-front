import { Routes } from '@angular/router';

export const catalogRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./catalog-page.component').then((m) => m.CatalogPageComponent),
  },
];
