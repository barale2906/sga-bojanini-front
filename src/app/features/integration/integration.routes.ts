import { Routes } from '@angular/router';
export const integrationRoutes: Routes = [
  { path: '', loadComponent: () => import('./integration.component').then(m => m.IntegrationComponent) },
];
