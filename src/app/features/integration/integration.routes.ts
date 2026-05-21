import { Routes } from '@angular/router';
export const integrationRoutes: Routes = [
  { path: '', loadComponent: () => import('./integration-page.component').then(m => m.IntegrationPageComponent) },
];
