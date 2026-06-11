import { Routes } from '@angular/router';

export const costCentersRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./cost-centers-page.component').then((m) => m.CostCentersPageComponent),
  },
];
